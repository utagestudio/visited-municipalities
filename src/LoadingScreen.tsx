export function LoadingScreen() {
  return (
    <main className="startupShell" aria-busy="true">
      <section className="startupMap" aria-label="地図を準備中">
        <p role="status">地図を読み込み中</p>
      </section>
      <aside className="startupPanel" aria-label="操作パネルを準備中">
        <p className="startupEyebrow">Visited municipalities</p>
        <h1>訪問済み市区町村マップ</h1>
        <p>訪問した日本全国の市区町村を色分けして記録できる無料のWebツールです。</p>
        <a href="#about">このツールについて・使い方</a>
      </aside>
    </main>
  );
}
