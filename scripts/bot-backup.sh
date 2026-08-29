#!/bin/sh
set -e

# NOTE (testnet2/wallet-api): the bot's data/ dir now also holds the wallet-api
# refresh token + inventory cursors. A restored token is only valid if the SAME
# WALLET_API_DEVICE_ID and mnemonic are used on restore (it is keyed per
# (network, chainPubkey, deviceId)).
#
# chess-bot keeps data/ on tmpfs (not on the host) — intentional, it self-mints
# and re-challenges on each start. But it is NOT stateless: journal/ holds the
# payments-v2 open-intent backstop and delivery journal, which is the only
# durable record of a payout that certified on-chain but has not been confirmed
# yet. Losing it strands that reward permanently and silently. journal/ MUST be
# backed up and restored with the bot.
#
# Which dirs exist varies by bot (chess-bot has tokens/ + journal/ but no
# data/), so back up whichever are present rather than assuming a fixed set.

usage() {
  echo "Usage: $0 backup|restore <bot-name>"
  echo "  bot-name: kbbot, viktor, etc."
  echo ""
  echo "Examples:"
  echo "  $0 backup viktor          # creates viktor-backup.tar.gz"
  echo "  $0 restore viktor         # restores from viktor-backup.tar.gz"
  exit 1
}

[ $# -eq 2 ] || usage

ACTION="$1"
BOT="$2"
ARCHIVE="${BOT}-backup.tar.gz"
BOT_DIR="data/${BOT}"

case "$ACTION" in
  backup)
    [ -d "$BOT_DIR" ] || { echo "Error: $BOT_DIR not found"; exit 1; }
    DIRS=""
    for d in data tokens journal; do
      if [ -d "$BOT_DIR/$d" ]; then
        DIRS="$DIRS $d"
      fi
    done
    [ -n "$DIRS" ] || { echo "Error: nothing to back up in $BOT_DIR"; exit 1; }
    echo "Backing up $BOT_DIR ($(echo "$DIRS" | tr -s ' ')) -> $ARCHIVE"
    # shellcheck disable=SC2086  # DIRS is a deliberate word-split list
    tar czf "$ARCHIVE" -C "$BOT_DIR" $DIRS
    # Explicit if/fi rather than a `[ ... ] && echo` one-liner: as the last
    # command in a branch, a false test makes the AND-OR list return non-zero,
    # which some shells treat as a `set -e` exit.
    if [ "$BOT" = "chess-bot" ]; then
      case "$DIRS" in
        *journal*) ;;
        *) echo "WARNING: no journal/ found — pending payouts are NOT covered" ;;
      esac
    fi
    echo "Done: $ARCHIVE"
    ;;
  restore)
    [ -f "$ARCHIVE" ] || { echo "Error: $ARCHIVE not found"; exit 1; }
    echo "Restoring $BOT from $ARCHIVE -> $BOT_DIR"
    mkdir -p "$BOT_DIR"
    # Replace only what the archive actually carries, so restoring an older
    # archive can never delete a journal/ it predates.
    for d in $(tar tzf "$ARCHIVE" | cut -d/ -f1 | sort -u); do
      rm -rf "${BOT_DIR:?}/${d:?}"
    done
    tar xzf "$ARCHIVE" -C "$BOT_DIR"
    echo "Done. Restart the bot: docker compose up -d $BOT"
    ;;
  *)
    usage
    ;;
esac
