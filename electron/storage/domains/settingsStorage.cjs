/**
 * Settings storage operations
 */

const { defaultSettings } = require("../schema.cjs");
const { toSettings } = require("../utils/transformers.cjs");

function createSettingsStorage(db, queries) {
  function getSettings() {
    const row = queries.getSettings.get("user-settings");
    return toSettings(row);
  }

  function saveSettings(settings) {
    const normalized = {
      ...defaultSettings,
      ...settings,
      modelName: String(settings.modelName || defaultSettings.modelName),
      themeMode: settings.themeMode === "dark" ? "dark" : "light",
      baseUrl: String(settings.baseUrl || ""),
      apiKey: String(settings.apiKey || ""),
      langsmithEnabled: Boolean(settings.langsmithEnabled),
      langsmithApiKey: String(settings.langsmithApiKey || ""),
      langsmithProject: String(settings.langsmithProject || ""),
      langsmithEndpoint: String(settings.langsmithEndpoint || ""),
    };

    queries.upsertSettings.run({
      ...normalized,
      langsmithEnabled: Number(normalized.langsmithEnabled),
      langsmithApiKey: normalized.langsmithApiKey,
      langsmithProject: normalized.langsmithProject,
      langsmithEndpoint: normalized.langsmithEndpoint,
      desktopNotifications: Number(normalized.desktopNotifications),
      developerLogging: Number(normalized.developerLogging),
      dataTelemetry: Number(normalized.dataTelemetry),
    });
    return true;
  }

  return {
    getSettings,
    saveSettings,
  };
}

module.exports = {
  createSettingsStorage,
};
