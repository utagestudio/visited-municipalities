import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';
import { MunicipalityMap } from './MunicipalityMap';
import { pickColorForMunicipality } from './colors';
import { loadMapData, type LoadedMapData } from './data';
import { createShareUrl, isShareUrl, readSharedStateFromUrl } from './share';
import {
  createEmptyState,
  loadSavedState,
  parseSavedState,
  pruneStateToKnownMunicipalities,
  saveState,
  serializeSavedState,
} from './storage';
import type { MunicipalityFeature, SavedState } from './types';

export function App() {
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const [isReadOnlyShare] = useState(() => isShareUrl());
  const [mapData, setMapData] = useState<LoadedMapData | null>(null);
  const [state, setState] = useState<SavedState>(() => {
    if (!isShareUrl()) {
      return loadSavedState();
    }

    try {
      return readSharedStateFromUrl() ?? createEmptyState();
    } catch {
      return createEmptyState();
    }
  });
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [focusCode, setFocusCode] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [shareStatus, setShareStatus] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    loadMapData()
      .then((loaded) => {
        if (cancelled) {
          return;
        }

        const knownCodes = new Set(loaded.municipalities.features.map((feature) => feature.properties.municipalityCode));
        setState((current) => pruneStateToKnownMunicipalities(current, knownCodes));
        setMapData(loaded);
      })
      .catch((loadError: unknown) => {
        setError(loadError instanceof Error ? loadError.message : '地図データの読み込みに失敗しました。');
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (isReadOnlyShare) {
      return;
    }

    saveState(state);
  }, [isReadOnlyShare, state]);

  const selectedFeature = useMemo(
    () => mapData?.municipalities.features.find((feature) => feature.properties.municipalityCode === selectedCode) ?? null,
    [mapData, selectedCode],
  );

  const searchResults = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!mapData || normalizedQuery.length === 0) {
      return [];
    }

    return mapData.municipalities.features
      .filter((feature) => feature.properties.displayName.toLowerCase().includes(normalizedQuery))
      .slice(0, 8);
  }, [mapData, query]);

  const visitedCount = Object.keys(state.municipalities).length;
  const totalCount = mapData?.municipalities.features.length ?? 0;
  const visitedRate = totalCount === 0 ? 0 : Math.round((visitedCount / totalCount) * 1000) / 10;

  const selectMunicipality = useCallback(
    (municipalityCode: string) => {
      if (!mapData || isReadOnlyShare) {
        return;
      }

      setSelectedCode(municipalityCode);
      setState((current) => {
        if (current.municipalities[municipalityCode]) {
          return current;
        }

        return {
          ...current,
          municipalities: {
            ...current.municipalities,
            [municipalityCode]: {
              visited: true,
              color: pickColorForMunicipality(municipalityCode, current, mapData.adjacency),
            },
          },
        };
      });
    },
    [isReadOnlyShare, mapData],
  );

  const unvisitMunicipality = useCallback(
    (municipalityCode: string) => {
      if (isReadOnlyShare) {
        return;
      }

      setState((current) => {
        if (!current.municipalities[municipalityCode]) {
          return current;
        }

        const nextMunicipalities = { ...current.municipalities };
        delete nextMunicipalities[municipalityCode];

        return {
          ...current,
          municipalities: nextMunicipalities,
        };
      });
    },
    [isReadOnlyShare],
  );

  const unvisitSelected = useCallback(() => {
    if (!selectedCode) {
      return;
    }

    unvisitMunicipality(selectedCode);
  }, [selectedCode, unvisitMunicipality]);

  const changeSelectedColor = useCallback(
    (color: string) => {
      if (!selectedCode || isReadOnlyShare) {
        return;
      }

      setState((current) => {
        const municipality = current.municipalities[selectedCode];
        if (!municipality) {
          return current;
        }

        return {
          ...current,
          municipalities: {
            ...current.municipalities,
            [selectedCode]: {
              ...municipality,
              color,
            },
          },
        };
      });
    },
    [isReadOnlyShare, selectedCode],
  );

  const resetAll = useCallback(() => {
    if (isReadOnlyShare) {
      return;
    }

    setState(createEmptyState());
    setSelectedCode(null);
  }, [isReadOnlyShare]);

  const exportState = useCallback(() => {
    const blob = new Blob([serializeSavedState(state)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `visited-municipalities-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }, [state]);

  const importState = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = '';

      if (!file || !mapData || isReadOnlyShare) {
        return;
      }

      try {
        const imported = parseSavedState(await file.text());
        const knownCodes = new Set(mapData.municipalities.features.map((feature) => feature.properties.municipalityCode));
        const pruned = pruneStateToKnownMunicipalities(imported, knownCodes);
        const importedCount = Object.keys(pruned.municipalities).length;
        const skippedCount = Object.keys(imported.municipalities).length - importedCount;

        setState(pruned);
        setSelectedCode(null);
        setImportStatus(
          skippedCount > 0
            ? `${importedCount}件をインポートしました。対象外の${skippedCount}件は除外しました。`
            : `${importedCount}件をインポートしました。`,
        );
      } catch {
        setImportStatus('JSONを読み込めませんでした。');
      }
    },
    [isReadOnlyShare, mapData],
  );

  const shareCurrentState = useCallback(async () => {
    const url = createShareUrl(state);

    try {
      if (navigator.share) {
        await navigator.share({
          title: '訪問済み市区町村マップ',
          text: `訪問済み ${visitedCount} / ${totalCount}`,
          url,
        });
        setShareStatus('共有しました。');
        return;
      }

      await navigator.clipboard.writeText(url);
      setShareStatus('共有URLをコピーしました。');
    } catch {
      setShareStatus('共有URLを作成しましたが、コピーできませんでした。');
    }
  }, [state, totalCount, visitedCount]);

  if (error) {
    return (
      <main className="appShell">
        <section className="emptyState">
          <h1>地図データを読み込めませんでした</h1>
          <p>{error}</p>
        </section>
      </main>
    );
  }

  if (!mapData) {
    return (
      <main className="appShell">
        <section className="emptyState">
          <h1>読み込み中</h1>
        </section>
      </main>
    );
  }

  return (
    <main className="appShell">
      <section className="mapRegion">
        <MunicipalityMap
          municipalities={mapData.municipalities}
          state={state}
          selectedCode={selectedCode}
          focusCode={focusCode}
          onSelect={isReadOnlyShare ? setSelectedCode : selectMunicipality}
          onUnvisit={isReadOnlyShare ? () => undefined : unvisitMunicipality}
          readOnly={isReadOnlyShare}
        />
      </section>

      <aside className="sidePanel" aria-label="操作パネル">
        <header className="panelHeader">
          <div>
            <p className="eyebrow">Visited municipalities</p>
            <h1>訪問済み市区町村マップ</h1>
          </div>
          <button className="ghostButton" type="button" onClick={resetAll} disabled={isReadOnlyShare}>
            リセット
          </button>
        </header>

        {isReadOnlyShare && (
          <section className="readOnlyBanner">
            <strong>共有表示</strong>
            <span>このURLの内容は編集・保存されません。</span>
          </section>
        )}

        <div className="statsGrid" aria-label="進捗">
          <Stat label="訪問済み" value={`${visitedCount}`} />
          <Stat label="全体" value={`${totalCount}`} />
          <Stat label="訪問率" value={`${visitedRate}%`} />
        </div>

        <section className="panelSection">
          <div className="fileActions">
            <button className="ghostButton" type="button" onClick={shareCurrentState}>
              共有
            </button>
            <button className="ghostButton" type="button" onClick={exportState}>
              エクスポート
            </button>
            <button
              className="ghostButton"
              type="button"
              onClick={() => importInputRef.current?.click()}
              disabled={isReadOnlyShare}
            >
              インポート
            </button>
          </div>
          <input
            ref={importInputRef}
            className="hiddenInput"
            type="file"
            accept="application/json,.json"
            onChange={importState}
          />
          {shareStatus && <p className="statusText">{shareStatus}</p>}
          {importStatus && <p className="statusText">{importStatus}</p>}
        </section>

        <section className="panelSection">
          <label className="fieldLabel" htmlFor="municipality-search">
            自治体検索
          </label>
          <input
            id="municipality-search"
            className="searchInput"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="例: 千代田区"
            type="search"
          />
          {searchResults.length > 0 && (
            <div className="searchResults">
              {searchResults.map((feature) => (
                <button
                  key={feature.properties.municipalityCode}
                  className="searchResult"
                  type="button"
                  onClick={() => {
                    if (isReadOnlyShare) {
                      setSelectedCode(feature.properties.municipalityCode);
                    } else {
                      selectMunicipality(feature.properties.municipalityCode);
                    }
                    setFocusCode(feature.properties.municipalityCode);
                  }}
                >
                  {feature.properties.displayName}
                </button>
              ))}
            </div>
          )}
        </section>

        <MunicipalityDetails
          feature={selectedFeature}
          color={selectedCode ? state.municipalities[selectedCode]?.color : undefined}
          onColorChange={changeSelectedColor}
          onUnvisit={unvisitSelected}
          readOnly={isReadOnlyShare}
        />

        <footer className="panelFooter">
          <span>データ: {mapData.manifest.datasetName}</span>
          <span>基準日: {mapData.manifest.sourceDate}</span>
        </footer>
      </aside>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function MunicipalityDetails({
  feature,
  color,
  onColorChange,
  onUnvisit,
  readOnly,
}: {
  feature: MunicipalityFeature | null;
  color: string | undefined;
  onColorChange: (color: string) => void;
  onUnvisit: () => void;
  readOnly: boolean;
}) {
  if (!feature) {
    return (
      <section className="panelSection detailPanel mutedPanel">
        <h2>自治体を選択</h2>
        <p>地図上の自治体をクリックすると訪問済みとして着色されます。</p>
      </section>
    );
  }

  return (
    <section className="panelSection detailPanel">
      <div>
        <p className="eyebrow">{feature.properties.prefectureName}</p>
        <h2>{feature.properties.municipalityName}</h2>
      </div>

      {color ? (
        <div className="colorEditor">
          <label className="fieldLabel" htmlFor="selected-color">
            色
          </label>
          <input
            id="selected-color"
            type="color"
            value={toColorInputValue(color)}
            onChange={(event) => onColorChange(event.target.value)}
            disabled={readOnly}
          />
        </div>
      ) : (
        <p className="mutedText">未訪問</p>
      )}

      <button className="dangerButton" type="button" onClick={onUnvisit} disabled={!color || readOnly}>
        訪問解除
      </button>
    </section>
  );
}

function toColorInputValue(color: string): string {
  if (color.startsWith('#')) {
    return color;
  }

  const hue = color.match(/hsl\(\s*(\d+)/i)?.[1] ?? '0';
  return hslToHex(Number(hue), 68, 58);
}

function hslToHex(hue: number, saturation: number, lightness: number): string {
  const sat = saturation / 100;
  const light = lightness / 100;
  const chroma = (1 - Math.abs(2 * light - 1)) * sat;
  const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const match = light - chroma / 2;
  const [red, green, blue] =
    hue < 60
      ? [chroma, x, 0]
      : hue < 120
        ? [x, chroma, 0]
        : hue < 180
          ? [0, chroma, x]
          : hue < 240
            ? [0, x, chroma]
            : hue < 300
              ? [x, 0, chroma]
              : [chroma, 0, x];

  return `#${[red, green, blue]
    .map((channel) => Math.round((channel + match) * 255).toString(16).padStart(2, '0'))
    .join('')}`;
}
