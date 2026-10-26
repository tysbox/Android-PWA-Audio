import React, { useState, useEffect } from 'react';
import { Download, Laptop, Smartphone, HelpCircle, X, CheckCircle2 } from 'lucide-react';
import { triggerHaptic } from '../utils/haptics';

export const PwaInstallBanner: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [showGuideModal, setShowGuideModal] = useState(false);

  useEffect(() => {
    // Check if app is already running in standalone mode
    if (window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone) {
      setIsInstalled(true);
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setIsInstallable(false);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleTriggerInstall = async () => {
    triggerHaptic('heavy');
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const choiceResult = await deferredPrompt.userChoice;
      if (choiceResult.outcome === 'accepted') {
        setIsInstalled(true);
        setIsInstallable(false);
      }
      setDeferredPrompt(null);
    } else {
      setShowGuideModal(true);
    }
  };

  return (
    <>
      {/* Floating PWA Install Controller Bar at bottom or top */}
      {!isInstalled && (
        <div className="fixed bottom-3 right-3 z-40 flex items-center gap-2 bg-neutral-900/90 backdrop-blur-md border border-amber-500/40 px-3 py-2 rounded-xl shadow-2xl shadow-black/80 text-xs">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
            </span>
            <span className="font-mono-tech text-[11px] font-bold text-neutral-200">
              PWA APP
            </span>
          </div>

          <button
            type="button"
            onClick={handleTriggerInstall}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-white font-bold font-mono-tech shadow-md transition-all cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            {isInstallable ? 'アプリをインストール' : 'インストールガイド'}
          </button>

          <button
            type="button"
            onClick={() => setShowGuideModal(true)}
            className="p-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white transition-colors cursor-pointer"
            title="PC / スマホ インストール手順"
          >
            <HelpCircle className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Installation Instructions Modal */}
      {showGuideModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-neutral-900 border border-neutral-700 rounded-2xl max-w-lg w-full p-5 text-neutral-200 shadow-2xl space-y-4 font-sans">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
              <div className="flex items-center gap-2">
                <Laptop className="w-5 h-5 text-amber-500" />
                <h3 className="font-bold text-base text-white font-mono-tech">
                  PWA (デスクトップ / モバイル) インストールガイド
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                className="p-1 rounded-lg hover:bg-neutral-800 text-neutral-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-neutral-400 leading-relaxed">
              Biscène Audio System は PWA (Progressive Web App) 対応アプリケーションです。Mac, Windows, iOS, Android 上で独立したアプリ（スタンドアロン）としてインストール・動作が可能です。
            </p>

            <div className="space-y-3 text-xs">
              {/* Chrome / Edge on Mac & Windows */}
              <div className="bg-neutral-950/70 p-3 rounded-xl border border-neutral-800 space-y-1">
                <div className="flex items-center gap-2 font-bold text-amber-400 font-mono-tech">
                  <Laptop className="w-4 h-4" />
                  Mac / Windows (Chrome & Edge)
                </div>
                <ol className="list-decimal list-inside text-neutral-300 space-y-1 pl-1 text-[11px]">
                  <li>アドレスバーの右側にある「インストール <Download className="w-3 h-3 inline" />」アイコンをクリック</li>
                  <li>または、ブラウザ右上メニュー（︙） →「アプリ」→「Biscène をインストール」を選択</li>
                </ol>
              </div>

              {/* Safari on Mac */}
              <div className="bg-neutral-950/70 p-3 rounded-xl border border-neutral-800 space-y-1">
                <div className="flex items-center gap-2 font-bold text-amber-400 font-mono-tech">
                  <Laptop className="w-4 h-4" />
                  Mac (Safari - macOS Sonoma 以降)
                </div>
                <ol className="list-decimal list-inside text-neutral-300 space-y-1 pl-1 text-[11px]">
                  <li>Safari 上部メニューの「ファイル」をクリック</li>
                  <li>「Dock に追加…」を選択して保存</li>
                </ol>
              </div>

              {/* iOS / iPadOS Safari */}
              <div className="bg-neutral-950/70 p-3 rounded-xl border border-neutral-800 space-y-1">
                <div className="flex items-center gap-2 font-bold text-amber-400 font-mono-tech">
                  <Smartphone className="w-4 h-4" />
                  iPhone / iPad (Safari)
                </div>
                <ol className="list-decimal list-inside text-neutral-300 space-y-1 pl-1 text-[11px]">
                  <li>画面下部の共有ボタン（□に↑アイコン）をタップ</li>
                  <li>メニューから「ホーム画面に追加」をタップ</li>
                </ol>
              </div>

              {/* Android Chrome */}
              <div className="bg-neutral-950/70 p-3 rounded-xl border border-neutral-800 space-y-1">
                <div className="flex items-center gap-2 font-bold text-amber-400 font-mono-tech">
                  <Smartphone className="w-4 h-4" />
                  Android (Chrome)
                </div>
                <ol className="list-decimal list-inside text-neutral-300 space-y-1 pl-1 text-[11px]">
                  <li>Chrome 右上メニュー（︙）をタップ</li>
                  <li>「アプリをインストール」または「ホーム画面に追加」を選択</li>
                </ol>
              </div>
            </div>

            {isInstallable && (
              <button
                type="button"
                onClick={handleTriggerInstall}
                className="w-full py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs font-mono-tech flex items-center justify-center gap-2 shadow-lg transition-colors cursor-pointer"
              >
                <Download className="w-4 h-4" />
                今すぐブラウザからインストールを呼び出す
              </button>
            )}

            {isInstalled && (
              <div className="flex items-center justify-center gap-2 py-2 text-emerald-400 text-xs font-bold font-mono-tech bg-emerald-950/50 rounded-xl border border-emerald-800">
                <CheckCircle2 className="w-4 h-4" />
                この端末にはすでにアプリとしてインストールされています
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};
