import { useCallback, useEffect, useMemo, useState } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';
import { MunicipalityMap } from './MunicipalityMap';
import { pickColorForMunicipality } from './colors';
import { loadMapData, type LoadedMapData } from './data';
import { createEmptyState, loadSavedState, pruneStateToKnownMunicipalities, saveState } from './storage';
import type { MunicipalityFeature, SavedState } from './types';

export function App() {
  const [mapData, setMapData] = useState<LoadedMapData | null>(null);
  const [state, setState] = useState<SavedState>(() => loadSavedState());
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [focusCode, setFocusCode] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

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
    saveState(state);
  }, [state]);

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
      if (!mapData) {
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
    [mapData],
  );

  const unvisitSelected = useCallback(() => {
    if (!selectedCode) {
      return;
    }

    setState((current) => {
      const nextMunicipalities = { ...current.municipalities };
      delete nextMunicipalities[selectedCode];

      return {
        ...current,
        municipalities: nextMunicipalities,
      };
    });
  }, [selectedCode]);

  const changeSelectedColor = useCallback(
    (color: string) => {
      if (!selectedCode) {
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
    [selectedCode],
  );

  const resetAll = useCallback(() => {
    setState(createEmptyState());
    setSelectedCode(null);
  }, []);

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
          onSelect={selectMunicipality}
        />
      </section>

      <aside className="sidePanel" aria-label="操作パネル">
        <header className="panelHeader">
          <div>
            <p className="eyebrow">Visited municipalities</p>
            <h1>訪問済み市区町村マップ</h1>
          </div>
          <button className="ghostButton" type="button" onClick={resetAll}>
            リセット
          </button>
        </header>

        <div className="statsGrid" aria-label="進捗">
          <Stat label="訪問済み" value={`${visitedCount}`} />
          <Stat label="全体" value={`${totalCount}`} />
          <Stat label="訪問率" value={`${visitedRate}%`} />
        </div>

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
                    selectMunicipality(feature.properties.municipalityCode);
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
}: {
  feature: MunicipalityFeature | null;
  color: string | undefined;
  onColorChange: (color: string) => void;
  onUnvisit: () => void;
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
          />
        </div>
      ) : (
        <p className="mutedText">未訪問</p>
      )}

      <button className="dangerButton" type="button" onClick={onUnvisit} disabled={!color}>
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
