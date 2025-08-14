#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import os
import re
import csv
import json
import argparse
import asyncio
from datetime import timezone
from typing import List, Tuple
from urllib.parse import urlparse, parse_qs

import pandas as pd
from telethon import TelegramClient
from telethon.tl.custom.message import Message

# ================================================================
# Config par défaut (sans identifiants en dur)
# ================================================================
API_ID: int | None = None
API_HASH: str | None = None
SESSION: str | None = None

CHANNEL_USERNAME = "Udemy_Free_Courses4"
FIRST_RUN_START_MESSAGE_ID = 231689  # ex: https://t.me/Udemy_Free_Courses4/231689

STATE_FILE = "state.json"
CSV_FILE = "findings.csv"

# ================================================================
# Helpers ENV
# ================================================================
def _env_int(name: str, default: int | None) -> int | None:
    val = os.getenv(name, "").strip()
    if not val:
        return default
    try:
        return int(val)
    except Exception:
        return default

API_ID = _env_int("TELEGRAM_API_ID", API_ID)
API_HASH = os.getenv("TELEGRAM_API_HASH", API_HASH)
SESSION = os.getenv("TELEGRAM_SESSION_NAME", SESSION)
CHANNEL_USERNAME = os.getenv("CHANNEL_USERNAME", CHANNEL_USERNAME) or CHANNEL_USERNAME
STATE_FILE = os.getenv("STATE_FILE", STATE_FILE) or STATE_FILE
CSV_FILE = os.getenv("CSV_FILE", CSV_FILE) or CSV_FILE
_fr = os.getenv("FIRST_RUN_START_MESSAGE_ID", "").strip()
if _fr.isdigit():
    FIRST_RUN_START_MESSAGE_ID = int(_fr)

# ================================================================
# Patterns / Regex
# ================================================================
KEYWORD_PATTERNS: List[Tuple[re.Pattern, str]] = [
    (re.compile(r"\bAZ[-\s]?104\b", re.IGNORECASE), "AZ-104"),
    (re.compile(r"\bSC[-\s]?200\b", re.IGNORECASE), "SC-200"),
    (re.compile(r"\bCCNA\b", re.IGNORECASE), "CCNA"),
    (re.compile(r"\b200[-\s]?301\b", re.IGNORECASE), "200-301"),
    (re.compile(r"CompTIA\s*Security\+", re.IGNORECASE), "CompTIA Security+"),
    (re.compile(r"\bSY0[-\s]?701\b", re.IGNORECASE), "SY0-701"),
]

UDEMY_URL_RE = re.compile(r"https?://(?:www\.)?udemy\.com/[^\s)>\]]+", re.IGNORECASE)

# ================================================================
# State helpers
# ================================================================
def load_state(channel: str) -> int:
    if not os.path.exists(STATE_FILE):
        return FIRST_RUN_START_MESSAGE_ID
    try:
        with open(STATE_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        return int(data.get(channel, FIRST_RUN_START_MESSAGE_ID))
    except Exception:
        return FIRST_RUN_START_MESSAGE_ID

def save_state(channel: str, last_message_id: int) -> None:
    data = {}
    if os.path.exists(STATE_FILE):
        try:
            with open(STATE_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
        except Exception:
            data = {}
    data[channel] = last_message_id
    tmp_path = STATE_FILE + ".tmp"
    with open(tmp_path, "w", encoding="utf-8", newline="\n") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    os.replace(tmp_path, STATE_FILE)

# ================================================================
# CSV helpers
# ================================================================
TARGET_COLS = ["date_utc", "message_id", "url", "keywords", "udemy_urls", "coupon_codes", "snippet"]

def ensure_csv_schema() -> None:
    """
    Vérifie/normalise le schéma du CSV :
    - si le fichier n'existe pas : crée l’en-tête v2
    - si 'keyword' (v1) existe et 'keywords' n'existe pas : migre vers v2
    - ajoute les colonnes manquantes (udemy_urls, coupon_codes, etc.) si besoin
    """
    if not os.path.exists(CSV_FILE):
        with open(CSV_FILE, "w", newline="", encoding="utf-8") as f:
            csv.writer(f).writerow(TARGET_COLS)
        return

    try:
        df = pd.read_csv(CSV_FILE)
    except Exception:
        with open(CSV_FILE, "w", newline="", encoding="utf-8") as f:
            csv.writer(f).writerow(TARGET_COLS)
        return

    cols = set(df.columns)

    # Migration v1 -> v2 : 'keyword' -> 'keywords'
    if "keyword" in cols and "keywords" not in cols:
        df["keywords"] = df["keyword"].astype(str)
        df.drop(columns=["keyword"], inplace=True)
        cols = set(df.columns)

    # Colonnes manquantes
    for col in TARGET_COLS:
        if col not in cols:
            df[col] = "" if col != "message_id" else pd.NA

    # Réordonner / filtrer
    df = df[TARGET_COLS]
    df.to_csv(CSV_FILE, index=False, encoding="utf-8")

def consolidate_csv() -> None:
    """Fusionne/déduplique par message_id dans findings.csv (schéma v2)."""
    if not os.path.exists(CSV_FILE):
        return
    try:
        df = pd.read_csv(CSV_FILE, dtype={"message_id": "Int64"})
        if df.empty:
            return

        # S’assurer des colonnes
        for c in TARGET_COLS:
            if c not in df.columns:
                df[c] = ""

        def merge_pipe(series: pd.Series) -> str:
            parts = []
            for v in series.dropna().astype(str):
                parts.extend([p.strip() for p in v.split("|") if p.strip()])
            return "|".join(sorted(set(parts)))

        def merge_semi(series: pd.Series) -> str:
            parts = []
            for v in series.dropna().astype(str):
                parts.extend([p.strip() for p in v.split(";") if p.strip()])
            return ";".join(sorted(set(parts)))

        def longest(series: pd.Series) -> str:
            s = [str(x) for x in series.dropna().astype(str)]
            return max(s, key=len) if s else ""

        grouped = df.groupby("message_id", as_index=False).agg({
            "date_utc": "first",
            "url": "first",
            "keywords": merge_pipe,
            "udemy_urls": merge_semi,
            "coupon_codes": merge_semi,
            "snippet": longest
        })

        before, after = len(df), len(grouped)
        grouped.to_csv(CSV_FILE, index=False, encoding="utf-8")
        if before != after:
            print(f"[INFO] CSV consolidé : {before} -> {after} ligne(s).")
    except Exception as e:
        print(f"[WARN] Consolidation CSV ignorée (erreur: {e}).")

# ================================================================
# Message / Parsing
# ================================================================
def message_text(msg: Message) -> str:
    text = getattr(msg, "text", None)
    if not text:
        text = getattr(msg, "message", None)
    return (text or "").strip()

def match_keywords(text: str) -> List[str]:
    found = []
    for pattern, label in KEYWORD_PATTERNS:
        if pattern.search(text):
            found.append(label)
    return found

def make_message_url(username: str, message_id: int) -> str:
    return f"https://t.me/{username}/{message_id}"

def extract_udemy_links_and_coupons(text: str):
    urls = set()
    coupons = set()
    for m in UDEMY_URL_RE.finditer(text):
        url = m.group(0)
        urls.add(url)
        try:
            q = parse_qs(urlparse(url).query)
            for code in q.get("couponCode", []) + q.get("couponcode", []):
                if code:
                    coupons.add(code.strip())
        except Exception:
            pass
    return sorted(urls), sorted(coupons)

# ================================================================
# Core
# ================================================================
async def run(
    from_id: int | None,
    reset_state: bool,
    dry_run: bool,
    verbose: bool
) -> None:
    # Validation identifiants
    if not API_ID or not API_HASH or not SESSION:
        raise RuntimeError(
            "⚠️ TELEGRAM_API_ID, TELEGRAM_API_HASH et TELEGRAM_SESSION_NAME doivent être définis via l'environnement."
        )

    client = TelegramClient(SESSION, API_ID, API_HASH)
    await client.start()

    # Point de départ
    if from_id is not None:
        start_id = from_id
        if verbose:
            print(f"[INFO] Start override via --from-id = {start_id}")
    elif reset_state:
        start_id = FIRST_RUN_START_MESSAGE_ID
        if verbose:
            print(f"[INFO] Start forced via --reset-state = {start_id}")
    else:
        start_id = load_state(CHANNEL_USERNAME)
        if verbose:
            print(f"[INFO] Start from state.json = {start_id}")

    # Préparer CSV (création/migration schéma)
    ensure_csv_schema()

    max_seen_id = start_id
    count_scanned = 0
    count_matched = 0

    async for msg in client.iter_messages(
        CHANNEL_USERNAME,
        min_id=start_id,
        reverse=True
    ):
        if not isinstance(msg, Message):
            continue

        count_scanned += 1
        if msg.id > max_seen_id:
            max_seen_id = msg.id

        text = message_text(msg)
        if not text:
            continue

        labels = match_keywords(text)
        if not labels:
            if verbose and (count_scanned % 500 == 0):
                print(f"[SCAN] Dernier ID vu: {msg.id}")
            continue

        labels_sorted = sorted(set(labels))
        udemy_urls, coupon_codes = extract_udemy_links_and_coupons(text)

        tme_url = make_message_url(CHANNEL_USERNAME, msg.id)
        snippet = text.replace("\n", " ")[:500]

        if not dry_run:
            with open(CSV_FILE, "a", newline="", encoding="utf-8") as f:
                writer = csv.writer(f)
                writer.writerow([
                    msg.date.astimezone(timezone.utc).isoformat(),
                    msg.id,
                    tme_url,
                    "|".join(labels_sorted),
                    ";".join(udemy_urls),
                    ";".join(coupon_codes),
                    snippet
                ])

        count_matched += 1
        print(f"[MATCH] {msg.id} | {labels_sorted} | {tme_url}")

    if max_seen_id > start_id and not dry_run:
        save_state(CHANNEL_USERNAME, max_seen_id)
        if verbose:
            print(f"[STATE] Sauvegardé: {CHANNEL_USERNAME} -> last_id={max_seen_id}")

    if not dry_run:
        consolidate_csv()

    if verbose:
        print(f"[STATS] Scannés: {count_scanned}, Matches: {count_matched}")

# Wrapper pratique
def run_scan_cli(from_id=None, reset_state=False, dry_run=False, verbose=False):
    asyncio.run(run(from_id=from_id, reset_state=reset_state, dry_run=dry_run, verbose=verbose))

# ================================================================
# CLI
# ================================================================
def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Scanner Telegram pour coupons Udemy (certifs).")
    p.add_argument("--from-id", type=int, default=None,
                   help="Force un ID de départ (ignore l'état sauvegardé).")
    p.add_argument("--reset-state", action="store_true",
                   help="Ignore state.json et repart de FIRST_RUN_START_MESSAGE_ID.")
    p.add_argument("--dry-run", action="store_true",
                   help="Lecture seule : n'écrit ni CSV ni state.json.")
    p.add_argument("--verbose", action="store_true",
                   help="Affiche plus de logs.")
    return p.parse_args()

if __name__ == "__main__":
    args = parse_args()
    asyncio.run(run(
        from_id=args.from_id,
        reset_state=args.reset_state,
        dry_run=args.dry_run,
        verbose=args.verbose
    ))
