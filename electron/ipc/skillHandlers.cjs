/**
 * IPC handlers for skill-related operations
 */

const { ipcMain } = require("electron");

function registerSkillHandlers({ skillManager }) {
  ipcMain.handle("skill:list", async () => {
    if (!skillManager) {
      return [];
    }
    return skillManager.listSkills();
  });

  ipcMain.handle("skill:listEnabled", async () => {
    if (!skillManager) {
      return [];
    }
    return skillManager.listEnabledSkills();
  });

  ipcMain.handle("skill:get", async (_event, id) => {
    if (!skillManager) {
      return null;
    }
    return skillManager.getSkillById(id);
  });

  ipcMain.handle("skill:install", async (_event, payload) => {
    if (!skillManager) {
      throw new Error("Skill manager is unavailable.");
    }
    return skillManager.installSkill(payload);
  });

  ipcMain.handle("skill:uninstall", async (_event, id) => {
    if (!skillManager) {
      return false;
    }
    return skillManager.uninstallSkill(id);
  });

  ipcMain.handle("skill:enable", async (_event, id) => {
    if (!skillManager) {
      return false;
    }
    return skillManager.enableSkill(id);
  });

  ipcMain.handle("skill:disable", async (_event, id) => {
    if (!skillManager) {
      return false;
    }
    return skillManager.disableSkill(id);
  });

  ipcMain.handle("skill:refresh", async () => {
    if (!skillManager) {
      return [];
    }
    return skillManager.listSkills();
  });
}

module.exports = { registerSkillHandlers };
