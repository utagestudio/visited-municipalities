import { type ChangeEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';
import { MunicipalityMap } from './MunicipalityMap';
import { pickColorForMunicipality } from './colors';
import { loadMapData, type LoadedMapData } from './data';
import { createShareUrl, isShareUrl, readSharedStateFromUrl } from './share';
import {
  createEmptyState,
  DEFAULT_BACKGROUND_COLOR,
  loadSavedState,
  parseSavedState,
  pruneStateToKnownMunicipalities,
  saveState,
  serializeSavedState,
} from './storage';
import type { MunicipalityFeature, SavedState } from './types';

const HELP_SEEN_KEY = 'visitedMunicipalityMap:helpSeen';

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
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [isHelpOpen, setIsHelpOpen] = useState(() => {
    if (isShareUrl()) {
      return false;
    }

    return window.localStorage.getItem(HELP_SEEN_KEY) !== '1';
  });

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

  const changeBackgroundColor = useCallback(
    (backgroundColor: string) => {
      if (isReadOnlyShare) {
        return;
      }

      setState((current) => ({
        ...current,
        backgroundColor,
      }));
    },
    [isReadOnlyShare],
  );

  const resetAll = useCallback(() => {
    if (isReadOnlyShare) {
      return;
    }

    setState(createEmptyState());
    setSelectedCode(null);
  }, [isReadOnlyShare]);

  const startOwnMap = useCallback(() => {
    saveState(createEmptyState());
    window.location.assign(`${window.location.origin}${window.location.pathname}`);
  }, []);

  const closeHelp = useCallback(() => {
    setIsHelpOpen(false);

    if (!isReadOnlyShare) {
      window.localStorage.setItem(HELP_SEEN_KEY, '1');
    }
  }, [isReadOnlyShare]);

  useEffect(() => {
    if (!isHelpOpen) {
      return;
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        closeHelp();
      }
    }

    window.addEventListener('keydown', closeOnEscape);

    return () => {
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [closeHelp, isHelpOpen]);

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
    setShareUrl(url);

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

      if (await copyText(url)) {
        setShareStatus('共有URLをコピーしました。');
      } else {
        setShareStatus('共有URLを作成しました。下の欄からコピーしてください。');
      }
    } catch {
      setShareStatus('共有URLを作成しました。下の欄からコピーしてください。');
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

        <section className="panelSection actionPanel" aria-label="操作">
          <BackgroundSettings
            color={state.backgroundColor}
            onColorChange={changeBackgroundColor}
            readOnly={isReadOnlyShare}
          />

          <div className="fileActions">
            <button className="ghostButton" type="button" onClick={shareCurrentState}>
              <ButtonIcon type="share" />
              共有
            </button>
            <button className="ghostButton" type="button" onClick={exportState}>
              <ButtonIcon type="export" />
              エクスポート
            </button>
            <button
              className="ghostButton"
              type="button"
              onClick={() => importInputRef.current?.click()}
              disabled={isReadOnlyShare}
            >
              <ButtonIcon type="import" />
              インポート
            </button>
          </div>
          <div className="utilityActions">
            <button className="ghostButton" type="button" onClick={() => setIsHelpOpen(true)}>
              <ButtonIcon type="help" />
              使い方
            </button>
            {isReadOnlyShare ? (
              <button className="primaryButton" type="button" onClick={startOwnMap}>
                <ButtonIcon type="create" />
                自分も作ってみる！
              </button>
            ) : (
              <button className="ghostButton" type="button" onClick={resetAll}>
                <ButtonIcon type="reset" />
                リセット
              </button>
            )}
          </div>
          <input
            ref={importInputRef}
            className="hiddenInput"
            type="file"
            accept="application/json,.json"
            onChange={importState}
          />
          {shareStatus && <p className="statusText">{shareStatus}</p>}
          {shareUrl && (
            <textarea
              className="shareUrlField"
              value={shareUrl}
              readOnly
              rows={3}
              onFocus={(event) => event.currentTarget.select()}
              aria-label="共有URL"
            />
          )}
          {importStatus && <p className="statusText">{importStatus}</p>}
        </section>

        <footer className="panelFooter">
          <span>データ: {mapData.manifest.datasetName}</span>
          <span>基準日: {mapData.manifest.sourceDate}</span>
        </footer>
      </aside>

      {isHelpOpen && <HelpModal isReadOnlyShare={isReadOnlyShare} onClose={closeHelp} />}
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
        <ButtonIcon type="trash" />
        訪問解除
      </button>
    </section>
  );
}

function BackgroundSettings({
  color,
  onColorChange,
  readOnly,
}: {
  color: string;
  onColorChange: (color: string) => void;
  readOnly: boolean;
}) {
  return (
    <section className="panelSection backgroundPanel">
      <div className="backgroundEditor">
        <label className="fieldLabel" htmlFor="background-color">
          背景色
        </label>
        <div className="backgroundControls">
          <input
            id="background-color"
            type="color"
            value={toColorInputValue(color)}
            onChange={(event) => onColorChange(event.target.value)}
            disabled={readOnly}
          />
          <button
            className="ghostButton compactButton"
            type="button"
            onClick={() => onColorChange(DEFAULT_BACKGROUND_COLOR)}
            disabled={readOnly || color.toLowerCase() === DEFAULT_BACKGROUND_COLOR}
          >
            標準
          </button>
        </div>
      </div>
    </section>
  );
}

function ButtonIcon({ type }: { type: 'help' | 'reset' | 'share' | 'export' | 'import' | 'close' | 'trash' | 'create' }) {
  if (type === 'help') {
    return (
      <span className="buttonIcon" aria-hidden="true">
        <svg viewBox="0 0 24 24" focusable="false">
          <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z" />
          <path d="M9.8 9a2.3 2.3 0 0 1 4.4 1c0 1.7-2.2 1.9-2.2 3.4" />
          <path d="M12 17h.1" />
        </svg>
      </span>
    );
  }

  if (type === 'reset') {
    return (
      <span className="buttonIcon" aria-hidden="true">
        <svg viewBox="0 0 24 24" focusable="false">
          <path d="M5 8v5h5" />
          <path d="M6.8 15.4a6.5 6.5 0 1 0 1-8.4L5 9.7" />
        </svg>
      </span>
    );
  }

  if (type === 'share') {
    return (
      <span className="buttonIcon" aria-hidden="true">
        <svg viewBox="0 0 24 24" focusable="false">
          <path d="M8.2 13.2 15.8 17" />
          <path d="M15.8 7 8.2 10.8" />
          <path d="M6 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
          <path d="M18 8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
          <path d="M18 20.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
        </svg>
      </span>
    );
  }

  if (type === 'export' || type === 'import') {
    return (
      <span className="buttonIcon" aria-hidden="true">
        <svg viewBox="0 0 24 24" focusable="false">
          <path d="M5 15.5v3h14v-3" />
          {type === 'export' ? (
            <>
              <path d="M12 15V5" />
              <path d="m8.5 8.5 3.5-3.5 3.5 3.5" />
            </>
          ) : (
            <>
              <path d="M12 5v10" />
              <path d="m8.5 11.5 3.5 3.5 3.5-3.5" />
            </>
          )}
        </svg>
      </span>
    );
  }

  if (type === 'close') {
    return (
      <span className="buttonIcon" aria-hidden="true">
        <svg viewBox="0 0 24 24" focusable="false">
          <path d="m7 7 10 10" />
          <path d="m17 7-10 10" />
        </svg>
      </span>
    );
  }

  if (type === 'create') {
    return (
      <span className="buttonIcon" aria-hidden="true">
        <svg viewBox="0 0 24 24" focusable="false">
          <path d="M12 3.5 13.5 8l4.6.4-3.5 3 1.1 4.5-3.7-2.4-3.7 2.4 1.1-4.5-3.5-3 4.6-.4Z" />
          <path d="M5 18.5h14" />
        </svg>
      </span>
    );
  }

  return (
    <span className="buttonIcon" aria-hidden="true">
      <svg viewBox="0 0 24 24" focusable="false">
        <path d="M6.5 7h11" />
        <path d="M10 7V5h4v2" />
        <path d="M8 7.5 8.7 19h6.6L16 7.5" />
        <path d="M11 11v4" />
        <path d="M13 11v4" />
      </svg>
    </span>
  );
}

function HelpModal({ isReadOnlyShare, onClose }: { isReadOnlyShare: boolean; onClose: () => void }) {
  return (
    <div className="modalOverlay" role="presentation" onMouseDown={onClose}>
      <section
        className="helpModal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="modalHeader">
          <div>
            <p className="eyebrow">How to use</p>
            <h2 id="help-title">使い方</h2>
          </div>
          <button className="ghostButton" type="button" onClick={onClose}>
            <ButtonIcon type="close" />
            閉じる
          </button>
        </header>

        {isReadOnlyShare ? (
          <p className="helpLead">共有URLを開いているため、この表示では編集や保存は行われません。</p>
        ) : (
          <p className="helpLead">訪問した市区町村をクリックして、自分用の訪問済みマップを作れます。</p>
        )}

        <div className="helpGrid">
          <HelpItem
            icon={<HelpIcon type="left-click" />}
            title="記録する"
            text="地図上の自治体をクリックすると訪問済みになり、自動で色が付きます。"
          />
          <HelpItem
            icon={<HelpIcon type="right-click" />}
            title="解除する"
            text="訪問済みの自治体を右クリック、スマホでは長押しします。詳細パネルの訪問解除も使えます。"
          />
          <HelpItem
            icon={<HelpIcon type="palette" />}
            title="色を変える"
            text="訪問済み自治体を選択して、詳細パネルの色から好みの色に変更できます。"
          />
          <HelpItem
            icon={<HelpIcon type="search" />}
            title="探す"
            text="検索欄に自治体名を入力すると候補が表示され、選ぶとその場所へ移動します。"
          />
          <HelpItem
            icon={<HelpIcon type="share" />}
            title="共有する"
            text="共有ボタンでSNS向けのURLを作成できます。共有URLは閲覧専用です。"
          />
          <HelpItem
            icon={<HelpIcon type="save" />}
            title="保存する"
            text="通常表示ではブラウザに自動保存されます。JSONのエクスポート・インポートも使えます。"
          />
        </div>
      </section>
    </div>
  );
}

function HelpItem({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className="helpItem">
      <strong>
        <span className="helpIcon" aria-hidden="true">
          {icon}
        </span>
        {title}
      </strong>
      <span>{text}</span>
    </div>
  );
}

function HelpIcon({ type }: { type: 'left-click' | 'right-click' | 'palette' | 'search' | 'share' | 'save' }) {
  if (type === 'left-click' || type === 'right-click') {
    const activeButtonPath = type === 'left-click' ? 'M12 2.5a7 7 0 0 0-7 7v1h7Z' : 'M12 2.5a7 7 0 0 1 7 7v1h-7Z';

    return (
      <svg viewBox="0 0 24 24" focusable="false">
        <path d={activeButtonPath} className="helpIconAccent" />
        <path d="M12 2.5a7 7 0 0 0-7 7v5a7 7 0 0 0 14 0v-5a7 7 0 0 0-7-7Z" />
        <path d="M12 2.5v8" />
        <path d="M5 10.5h14" />
      </svg>
    );
  }

  if (type === 'palette') {
    return (
      <svg viewBox="0 0 24 24" focusable="false">
        <path d="M12 3a9 9 0 0 0 0 18h1.2a2.2 2.2 0 0 0 1.2-4h-.9a1.7 1.7 0 0 1 0-3.4H16a5 5 0 0 0 0-10A9.6 9.6 0 0 0 12 3Z" />
        <path d="M7.5 11.4h.1" />
        <path d="M9.4 7.8h.1" />
        <path d="M14 7.6h.1" />
      </svg>
    );
  }

  if (type === 'search') {
    return (
      <svg viewBox="0 0 24 24" focusable="false">
        <path d="M10.8 5a5.8 5.8 0 1 0 0 11.6 5.8 5.8 0 0 0 0-11.6Z" />
        <path d="m15.2 15.2 4.1 4.1" />
      </svg>
    );
  }

  if (type === 'share') {
    return (
      <svg viewBox="0 0 24 24" focusable="false">
        <path d="M8.2 13.2 15.8 17" />
        <path d="M15.8 7 8.2 10.8" />
        <path d="M6 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
        <path d="M18 8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
        <path d="M18 20.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" focusable="false">
      <path d="M6 3.5h10.4L19 6.1v14.4H6Z" />
      <path d="M8.5 3.5v6h7v-6" />
      <path d="M8.5 15.2h7" />
      <path d="M8.5 18h5" />
    </svg>
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

async function copyText(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to the legacy path.
    }
  }

  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.setAttribute('readonly', '');
  textArea.style.position = 'fixed';
  textArea.style.left = '-9999px';
  document.body.append(textArea);
  textArea.select();

  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    textArea.remove();
  }
}
