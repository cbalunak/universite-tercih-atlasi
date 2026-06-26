#!/bin/zsh -l

cd "$(dirname "$0")"

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
export DATABASE_URL="file:$PWD/dev.db"

if [ -s "$HOME/.nvm/nvm.sh" ]; then
  source "$HOME/.nvm/nvm.sh"
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm bulunamadı. Node.js kurulu değil ya da Terminal yolu tanımıyor."
  echo "Node.js kurulduktan sonra bu dosyayı tekrar açın."
  read "?Kapatmak için Enter'a basın..."
  exit 1
fi

NODE_VERSION="$(node -p 'process.versions.node' 2>/dev/null)"
NODE_OK="$(node - <<'NODE'
const [major, minor] = process.versions.node.split(".").map(Number);
const ok = major >= 24 || (major === 22 && minor >= 12) || (major === 20 && minor >= 19);
process.stdout.write(ok ? "1" : "0");
NODE
)"

if [ "$NODE_OK" != "1" ]; then
  echo "Node.js sürümü eski: $NODE_VERSION"
  echo "Kullanılan node yolu: $(command -v node)"
  echo "Bu uygulama için Node.js 22.12+ LTS veya daha yeni desteklenen bir sürüm gerekiyor."
  echo "https://nodejs.org adresinden Node.js 22 LTS kurup Terminal'i yeniden açın."
  read "?Kapatmak için Enter'a basın..."
  exit 1
fi

if [ ! -d "node_modules" ]; then
  echo "Paketler kuruluyor..."
  if ! npm install; then
    echo ""
    echo "Paket kurulumu başarısız oldu."
    read "?Kapatmak için Enter'a basın..."
    exit 1
  fi
fi

if [ ! -f "generated/prisma/client.ts" ]; then
  echo "Prisma dosyaları hazırlanıyor..."
  if ! npm run prisma:generate; then
    echo ""
    echo "Prisma dosyaları hazırlanamadı."
    read "?Kapatmak için Enter'a basın..."
    exit 1
  fi
fi

if ! node <<'NODE'
const fs = require("node:fs");
const path = require("node:path");

const dbPath = path.join(process.cwd(), "dev.db");

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (!fs.existsSync(dbPath)) {
  fail(`dev.db bulunamadı: ${dbPath}`);
}

const stat = fs.statSync(dbPath);
if (stat.size < 1_000_000) {
  fail(`dev.db çok küçük görünüyor (${stat.size} byte). Atlas verisi olmayan boş dosya olabilir.`);
}

const Database = require("better-sqlite3");
const db = new Database(dbPath, { readonly: true });
try {
  const programTable = db.prepare("select name from sqlite_master where type = 'table' and name = 'Program'").get();
  if (!programTable) fail("dev.db içinde Program tablosu yok.");

  const count = db.prepare("select count(*) as count from Program").get().count;
  if (count < 1000) fail(`dev.db içindeki program sayısı düşük görünüyor: ${count}`);

  console.log(`Veritabanı hazır: ${count} program`);
} finally {
  db.close();
}
NODE
then
  echo ""
  echo "Veritabanı hazır değil."
  echo "Ana bilgisayardaki dev.db dosyasını bu klasöre kopyalayın:"
  echo "$PWD/dev.db"
  echo ""
  echo "Doğru dosya yaklaşık 18 MB olmalı."
  read "?Kapatmak için Enter'a basın..."
  exit 1
fi

echo "Üniversite Tercih Atlası başlatılıyor..."

EXISTING_PID="$(lsof -tiTCP:3000 -sTCP:LISTEN | head -n 1)"
if [ -n "$EXISTING_PID" ]; then
  EXISTING_COMMAND="$(ps -p "$EXISTING_PID" -o command= 2>/dev/null)"
  if [[ "$EXISTING_COMMAND" == *"next"* || "$EXISTING_COMMAND" == *"node"* ]]; then
    echo "3000 portunda takılı kalmış eski sunucu bulundu. Kapatılıyor..."
    kill "$EXISTING_PID" >/dev/null 2>&1
    sleep 2
    if lsof -iTCP:3000 -sTCP:LISTEN >/dev/null 2>&1; then
      echo "Eski sunucu kapanmadı, zorla kapatılıyor..."
      kill -9 "$EXISTING_PID" >/dev/null 2>&1
      sleep 1
    fi
  else
    echo "3000 portu başka bir uygulama tarafından kullanılıyor."
    echo "$EXISTING_COMMAND"
  fi
fi

PORT=3000
while lsof -iTCP:$PORT -sTCP:LISTEN >/dev/null 2>&1; do
  PORT=$((PORT + 1))
done

URL="http://127.0.0.1:$PORT"
LOG_FILE="$PWD/baslat.log"

echo "Adres: $URL"
echo "Log: $LOG_FILE"
echo ""

npm run dev -- -H 127.0.0.1 -p "$PORT" > "$LOG_FILE" 2>&1 &
SERVER_PID=$!

echo "Sunucu hazırlanıyor..."
for attempt in {1..90}; do
  if ! kill -0 "$SERVER_PID" >/dev/null 2>&1; then
    echo ""
    echo "Sunucu başlatılamadı. Hata:"
    tail -n 80 "$LOG_FILE"
    echo ""
    read "?Kapatmak için Enter'a basın..."
    exit 1
  fi

  if curl --max-time 2 -fsS "$URL" >/dev/null 2>&1; then
    echo "Sunucu hazır."
    open "$URL"
    break
  fi

  sleep 1
done

if ! curl --max-time 2 -fsS "$URL" >/dev/null 2>&1; then
  echo ""
  echo "Sunucu 90 saniye içinde cevap vermedi. Son log:"
  tail -n 80 "$LOG_FILE"
  echo ""
  read "?Kapatmak için Enter'a basın..."
  exit 1
fi

echo ""
echo "Site açık. Bu pencere açık kaldıkça çalışır."
echo "Durdurmak için Control+C kullanabilirsiniz."
echo ""
tail -f "$LOG_FILE" &
TAIL_PID=$!
wait "$SERVER_PID"
kill "$TAIL_PID" >/dev/null 2>&1

echo ""
echo "Sunucu durdu."
read "?Kapatmak için Enter'a basın..."
