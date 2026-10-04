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
- 存在しないパスの404ページ: `public/404.html`

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

## Google Tag ManagerとCookie同意

Cloudflare Pagesの対象プロジェクトの **Settings → Variables and Secrets** で、
環境変数 `GTM_ID` にコンテナID（例: `GTM-XXXXXXX`）を設定してください。
Production / Previewの必要な環境に設定します。`VITE_` 接頭辞は不要です。
`GTM_ID` のみを明示的にフロントエンドへ渡します。
値はビルド時に埋め込まれるため、設定・変更後は再ビルド／再デプロイが必要です。

未設定または空の場合は同意画面もGTMも表示・読み込みしません。
設定済みの場合はCookie同意画面を表示し、承認後のみGTMを読み込みます。
承認・拒否は `localStorage` の `visitedMunicipalityMap:cookieConsent:v1` に保存し、
再訪時も反映します。画面右下の「Cookie設定」から、いつでも選択を変更できます。
承認から拒否に変更する場合は、読み込み済みのタグを停止するためページを再読み込みします。
ブラウザで保存が利用できない場合は、現在のページでのみ選択を反映します。
同意前・拒否時にはGTMのscriptやiframeを挿入しません。

## テスト

```bash
mise exec -- npm test
mise exec -- npm run build
```

## お問い合わせ

[機能要望・不具合報告](https://tally.so/r/kdVdDR?product=%E8%A8%AA%E5%95%8F%E6%B8%88%E3%81%BF%E5%B8%82%E5%8C%BA%E7%94%BA%E6%9D%91%E3%83%9E%E3%83%83%E3%83%97) / [GitHub Issues](https://github.com/utagestudio/visited-municipalities/issues)

## SEOと静的配信

ツール本体の1画面構成を維持し、詳しい説明は静的な `/about` ページに置きます。操作パネルの「このツールについて」から別タブで開けます。リンクには `/about.html` を指定し、Vite開発サーバーでも静的ファイルを直接取得します。Cloudflare Pagesでは拡張子なしの `/about` へ正規化されます。初期HTMLにも短い概要と説明ページへのリンクを含め、React起動後は置き換えます。地図データの読み込み中・失敗時にも概要を表示します。

`/data/` は描画に必要なためクロールを許可し、データ単体の検索掲載は `_headers` の `X-Robots-Tag: noindex` で抑制します。

地図のルートは `/`、静的な説明ページは `/about` で、共有URLは `/?share=…` です。`public/404.html` によりCloudflare Pagesの自動SPAフォールバックを無効にし、存在しないパスは404にします。全パスをindex.htmlに書き換える `_redirects` は配置しません。

デプロイ後は `/` と共有URLが200、存在しないパスが404になること、robots.txt・sitemap.xml・地図データ・アセットが取得できることを確認してください。ViteのpreviewサーバーはCloudflareの404配信の検証には使えません。Search ConsoleのURL検査では本文と必要なリソースの取得状態を確認します。
