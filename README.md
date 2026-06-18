# 訪問済み市区町村マップ

訪問した日本の市区町村をブラウザ上で記録する静的Webアプリです。地図上の自治体をクリックすると訪問済みとして着色され、状態は `localStorage` に保存されます。

## 開発

この環境では Node.js は mise 経由で利用します。

```bash
mise exec -- npm install
mise exec -- npm run dev
```

Cloudflare Pages 向けの本番ビルド:

```bash
mise exec -- npm run build
```

- Build command: `npm run build`
- Output directory: `dist`
- SPA fallback: `public/_redirects`

## データ

初期状態では `public/data/*.sample.*` の小さなサンプルデータを読み込みます。

実データは国土数値情報 N03 をGeoJSONに変換したものを入力として、以下でアプリ用データに変換します。

```bash
N03_GEOJSON=./data/raw/n03.geojson \
N03_SOURCE_DATE=2023-01-01 \
SIMPLIFY_TOLERANCE=0.01 \
mise exec -- npm run prepare:data
```

生成されるファイル:

- `public/data/municipalities.generated.geojson`
- `public/data/adjacency.generated.json`
- `public/data/manifest.json`

前処理では以下を行います。

- 東京都23区は区単位で維持
- 政令指定都市の区は市単位キーへ集約
- 境界形状の簡略化
- 隣接リストの事前生成

## テスト

```bash
mise exec -- npm test
mise exec -- npm run build
```
