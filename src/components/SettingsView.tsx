import { useEffect, useState } from "react";
import type { Accent, AppSettings, LocalModel, Theme } from "../types";
import { Icon } from "./Icon";

interface Props {
  settings: AppSettings;
  models: LocalModel[];
  onUpdate: (settings: AppSettings) => void;
  onClearChats: () => void;
}

const THEMES: { id: Theme; label: string; description: string }[] = [
  { id: "dark", label: "Dark", description: "Warm dark gray" },
  { id: "black", label: "Black", description: "Pure black, high contrast" },
  { id: "light", label: "Light", description: "Bright and clean" },
];

const ACCENTS: { id: Accent; label: string; swatch: string }[] = [
  { id: "lime", label: "Lime", swatch: "#c8f759" },
  { id: "blue", label: "Blue", swatch: "#7ab8ff" },
  { id: "violet", label: "Violet", swatch: "#c9a7ff" },
  { id: "amber", label: "Amber", swatch: "#ffcf6e" },
];

const CONTEXT_OPTIONS = [2048, 4096, 8192, 16384];

export function SettingsView({ settings, models, onUpdate, onClearChats }: Props) {
  const [confirmingErase, setConfirmingErase] = useState(false);
  useEffect(() => {
    if (!confirmingErase) return;
    const timeout = window.setTimeout(() => setConfirmingErase(false), 3000);
    return () => window.clearTimeout(timeout);
  }, [confirmingErase]);

  const generation = settings.defaultGeneration;
  const setGeneration = (patch: Partial<typeof generation>) =>
    onUpdate({ ...settings, defaultGeneration: { ...generation, ...patch } });

  return (
    <section className="settings-view">
      <span className="page-label">Preferences</span>
      <h1>Settings</h1>

      <div className="settings-section">
        <h2>Appearance</h2>
        <p className="settings-hint">Theme and accent apply instantly, everywhere.</p>

        <div className="theme-picker">
          {THEMES.map((theme) => (
            <button
              key={theme.id}
              className={`theme-card theme-${theme.id} ${settings.theme === theme.id ? "active" : ""}`}
              onClick={() => onUpdate({ ...settings, theme: theme.id })}
              aria-pressed={settings.theme === theme.id}
            >
              <span className="theme-preview">
                <span className="preview-side" />
                <span className="preview-main">
                  <span className="preview-bubble" />
                  <span className="preview-line" />
                  <span className="preview-line short" />
                </span>
              </span>
              <strong>{theme.label}</strong>
              <small>{theme.description}</small>
            </button>
          ))}
        </div>

        <div className="accent-picker">
          {ACCENTS.map((accent) => (
            <button
              key={accent.id}
              className={`accent-swatch ${settings.accent === accent.id ? "active" : ""}`}
              style={{ background: accent.swatch }}
              onClick={() => onUpdate({ ...settings, accent: accent.id })}
              aria-label={`${accent.label} accent`}
              aria-pressed={settings.accent === accent.id}
              title={accent.label}
            />
          ))}
        </div>
      </div>

      <div className="settings-section">
        <h2>Assistant</h2>
        <p className="settings-hint">Defaults for new conversations. Existing chats keep their own settings.</p>

        <label className="field">
          <span>Default model</span>
          <select
            value={settings.defaultModelId ?? ""}
            onChange={(event) =>
              onUpdate({ ...settings, defaultModelId: event.target.value || null })
            }
          >
            <option value="">Ask each time (use first model)</option>
            {models.map((model) => (
              <option key={model.id} value={model.id}>
                {model.fileName.replace(/\.gguf$/i, "")}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>System prompt</span>
          <textarea
            rows={3}
            value={generation.systemPrompt}
            onChange={(event) => setGeneration({ systemPrompt: event.target.value })}
          />
        </label>

        <label className="field">
          <span>
            Temperature <em>{generation.temperature.toFixed(2)}</em>
          </span>
          <input
            type="range"
            min={0}
            max={2}
            step={0.05}
            value={generation.temperature}
            onChange={(event) => setGeneration({ temperature: Number(event.target.value) })}
          />
        </label>

        <label className="field">
          <span>
            Top P <em>{generation.topP.toFixed(2)}</em>
          </span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={generation.topP}
            onChange={(event) => setGeneration({ topP: Number(event.target.value) })}
          />
        </label>

        <div className="field-row">
          <label className="field">
            <span>Max response tokens</span>
            <input
              type="number"
              min={16}
              max={8192}
              step={16}
              value={generation.maxTokens}
              onChange={(event) =>
                setGeneration({ maxTokens: Math.max(16, Number(event.target.value) || 2048) })
              }
            />
          </label>
          <label className="field">
            <span>Context window</span>
            <select
              value={generation.contextSize}
              onChange={(event) => setGeneration({ contextSize: Number(event.target.value) })}
            >
              {CONTEXT_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  {size.toLocaleString()} tokens
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="settings-note">
          Reasoning models (those with thinking blocks) spend tokens before answering — keep the max
          high enough that the answer is not cut off.
        </p>
      </div>

      <div className="settings-section">
        <h2>Data</h2>
        <p className="settings-hint">Everything lives in the ATLAS folder on this device. Nothing is uploaded.</p>
        <button
          className="btn-danger"
          onClick={() => {
            if (confirmingErase) {
              onClearChats();
              setConfirmingErase(false);
            } else {
              setConfirmingErase(true);
            }
          }}
        >
          <Icon name="trash" size={13} />
          {confirmingErase ? "Click again to erase everything" : "Erase all conversations"}
        </button>
      </div>
    </section>
  );
}
