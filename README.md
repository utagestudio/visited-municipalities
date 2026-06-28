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

初期状態では `public/data/manifest.json` が指す生成済みの全国データを読み込みます。

現在の生成済みデータは、国土数値情報 N03 の令和5年（2023年1月1日時点）都道府県別ZIPを元にしています。

再生成する場合は、国土数値情報 N03 の都道府県別ZIPを `data/raw/` に配置してから以下を実行します。
ファイル名は `N03-20230101_01_GML.zip` から `N03-20230101_47_GML.zip` までを想定しています。

```bash
N03_SOURCE_DATE=2023-01-01 \
mise exec -- npm run prepare:data
```

単一のGeoJSONを入力にする場合は `N03_GEOJSON` を指定できます。

```bash
N03_GEOJSON=./data/raw/n03.geojson \
N03_SOURCE_DATE=2023-01-01 \
mise exec -- npm run prepare:data
```

生成されるファイル:

- `public/data/municipalities.generated.geojson`
- `public/data/adjacency.generated.json`
- `public/data/municipality-stats.generated.json`
- `public/data/manifest.json`

前処理では以下を行います。

- 東京都23区は区単位で維持
- 政令指定都市の区は市単位キーへ集約
- 自治体形状を一辺3000mの正三角形セルへ再構成
- 所属未定地や所属自治体が不明な埋立地を除外
- セル中心の近さから色回避用の近接グラフを事前生成
- N03元形状から自治体ごとの面積を算出
- `data/stats/municipality-stats.csv` があれば人口などの統計値をマージ

人口データは総務省統計局・e-Statの「令和2年国勢調査 都道府県・市区町村別の主な結果」Excelから生成できます。

- Source: https://www.e-stat.go.jp/stat-search/file-download?fileKind=0&statInfId=000032143614
- Population reference date: `2020-10-01`

```bash
mise exec -- npm run prepare:stats
```

ローカルに保存済みのExcelを使う場合は、以下のように指定します。

```bash
MUNICIPALITY_STATS_XLSX=/path/to/estat.xlsx \
mise exec -- npm run prepare:stats
```

三角形セルの粒度は必要に応じて調整できます。

```bash
TRIANGLE_CELL_SIZE_METERS=3000 \
TRIANGLE_COVERAGE_THRESHOLD=0.5 \
N03_SOURCE_DATE=2023-01-01 \
mise exec -- npm run prepare:data
```

人口データを含める場合は、`data/stats/municipality-stats.csv.example` を参考に以下の列を持つCSVを置いてから前処理を実行します。

```text
municipalityCode,population,populationAsOf,areaKm2,areaAsOf
```

`areaKm2` は省略可能です。省略時はN03元形状から算出した面積を使います。
e-Stat側で総人口が `-` の自治体は人口を空欄として扱い、ツールチップでは `データなし` と表示します。

## テスト

```bash
mise exec -- npm test
mise exec -- npm run build
```
