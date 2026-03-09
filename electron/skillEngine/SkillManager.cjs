const fs = require("fs/promises");
const path = require("path");
const AdmZip = require("adm-zip");
const {
  parseSkillDirectory,
  slugifySkillName,
} = require("./SkillInterpreter.cjs");

function now() {
  return Date.now();
}

function makeId(prefix = "skill") {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

function toSafeString(value, fallback = "") {
  if (typeof value === "string") {
    return value;
  }
  if (value === undefined || value === null) {
    return fallback;
  }
  return String(value);
}

function isPathWithinRoot(rootPath, targetPath) {
  const normalizedRoot = path.resolve(rootPath);
  const normalizedTarget = path.resolve(targetPath);
  if (normalizedRoot === normalizedTarget) {
    return true;
  }
  const relative = path.relative(normalizedRoot, normalizedTarget);
  return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function uniqueStrings(values) {
  const set = new Set();
  const result = [];
  for (const value of values) {
    const text = toSafeString(value, "").trim();
    if (!text || set.has(text)) {
      continue;
    }
    set.add(text);
    result.push(text);
  }
  return result;
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

class SkillManager {
  constructor(options = {}) {
    this.userDataDir = path.resolve(options.userDataDir || process.cwd());
    this.userSkillsDir = path.join(this.userDataDir, "skills");
    this.tempDir = path.join(this.userSkillsDir, ".tmp");
    this.registryPath = path.join(this.userSkillsDir, "registry.json");
    this.builtinSkillsDir = path.resolve(
      options.builtinSkillsDir || path.join(__dirname, "../skills_builtin"),
    );
    this.logger = options.logger || console;
  }

  async init() {
    await fs.mkdir(this.userSkillsDir, { recursive: true });
    await fs.mkdir(this.tempDir, { recursive: true });
    await this.refreshCatalog();
    return true;
  }

  async readRegistry() {
    try {
      const raw = await fs.readFile(this.registryPath, { encoding: "utf8" });
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed;
    } catch {
      return [];
    }
  }

  async writeRegistry(entries) {
    await fs.mkdir(path.dirname(this.registryPath), { recursive: true });
    await fs.writeFile(this.registryPath, `${JSON.stringify(entries, null, 2)}\n`, {
      encoding: "utf8",
    });
  }

  normalizeEntry(entry = {}) {
    const createdAt = Number.isFinite(Number(entry.createdAt))
      ? Number(entry.createdAt)
      : now();

    const updatedAt = Number.isFinite(Number(entry.updatedAt))
      ? Number(entry.updatedAt)
      : createdAt;

    return {
      id: toSafeString(entry.id, makeId("skill")),
      name: toSafeString(entry.name, "").trim() || "skill",
      displayName:
        toSafeString(entry.displayName, "").trim() ||
        toSafeString(entry.name, "Skill"),
      description: toSafeString(entry.description, "").trim() || "No description.",
      iconPath: toSafeString(entry.iconPath, "").trim() || null,
      iconRelativePath: toSafeString(entry.iconRelativePath, "").trim() || null,
      source: entry.source === "upload" ? "upload" : "builtin",
      installStatus:
        entry.installStatus === "installed" ? "installed" : "not_installed",
      enabled: Boolean(entry.enabled),
      installPath: toSafeString(entry.installPath, "").trim() || null,
      packagePath: toSafeString(entry.packagePath, "").trim() || null,
      version: toSafeString(entry.version, "").trim() || null,
      triggers: Array.isArray(entry.triggers)
        ? uniqueStrings(entry.triggers)
        : [],
      createdAt,
      updatedAt,
    };
  }

  toPublicSkill(entry) {
    const normalized = this.normalizeEntry(entry);
    let iconPath = normalized.iconPath;
    if (!iconPath && normalized.iconRelativePath) {
      if (normalized.installPath) {
        iconPath = path.resolve(normalized.installPath, normalized.iconRelativePath);
      } else if (normalized.packagePath) {
        iconPath = path.resolve(normalized.packagePath, normalized.iconRelativePath);
      }
    }

    return {
      id: normalized.id,
      name: normalized.name,
      displayName: normalized.displayName,
      description: normalized.description,
      iconPath,
      source: normalized.source,
      installStatus: normalized.installStatus,
      enabled: normalized.installStatus === "installed" && normalized.enabled,
      installPath: normalized.installPath,
      version: normalized.version,
      triggers: normalized.triggers,
      updatedAt: normalized.updatedAt,
      createdAt: normalized.createdAt,
    };
  }

  async scanBuiltinSkills() {
    const skills = [];
    let directories = [];
    try {
      directories = await fs.readdir(this.builtinSkillsDir, { withFileTypes: true });
    } catch {
      return [];
    }

    for (const dirent of directories) {
      if (!dirent.isDirectory()) {
        continue;
      }

      const skillRoot = path.join(this.builtinSkillsDir, dirent.name);
      try {
        const spec = await parseSkillDirectory(skillRoot, { strict: true });
        const id = `builtin:${spec.skillName}`;
        skills.push(
          this.normalizeEntry({
            id,
            name: spec.skillName,
            displayName: spec.name,
            description: spec.description,
            iconPath: spec.iconPath,
            iconRelativePath: spec.iconRelativePath,
            source: "builtin",
            installStatus: "not_installed",
            enabled: false,
            installPath: null,
            packagePath: skillRoot,
            version: spec.version,
            triggers: uniqueStrings([
              ...spec.triggers.aliases,
              ...spec.triggers.keywords,
            ]),
          }),
        );
      } catch (error) {
        this.logger.warn?.(
          `[skill-manager] 跳过无效的内置技能 ${skillRoot}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    return skills;
  }

  async refreshCatalog() {
    await fs.mkdir(this.userSkillsDir, { recursive: true });

    const existingEntries = (await this.readRegistry()).map((item) =>
      this.normalizeEntry(item),
    );
    const builtinSkills = await this.scanBuiltinSkills();

    const merged = [];
    const seen = new Set();

    for (const builtin of builtinSkills) {
      const current = existingEntries.find((item) => item.id === builtin.id);
      const hasInstallPath =
        current?.installPath && (await pathExists(current.installPath));
      merged.push(
        this.normalizeEntry({
          ...builtin,
          installStatus: hasInstallPath ? "installed" : "not_installed",
          enabled: hasInstallPath ? Boolean(current?.enabled) : false,
          installPath: hasInstallPath ? current.installPath : null,
          createdAt: current?.createdAt ?? now(),
          updatedAt: now(),
        }),
      );
      seen.add(builtin.id);
    }

    for (const entry of existingEntries) {
      if (seen.has(entry.id) || entry.source !== "upload") {
        continue;
      }
      const installed =
        entry.installPath && (await pathExists(entry.installPath))
          ? "installed"
          : "not_installed";
      merged.push(
        this.normalizeEntry({
          ...entry,
          installStatus: installed,
          enabled: installed === "installed" ? entry.enabled : false,
          installPath: installed === "installed" ? entry.installPath : null,
          updatedAt: now(),
        }),
      );
    }

    await this.writeRegistry(merged);
    return merged;
  }

  async listSkills() {
    const entries = await this.refreshCatalog();
    return entries
      .map((entry) => this.toPublicSkill(entry))
      .sort((left, right) => {
        if (left.installStatus !== right.installStatus) {
          return left.installStatus === "installed" ? -1 : 1;
        }
        return left.displayName.localeCompare(right.displayName);
      });
  }

  async listEnabledSkills() {
    const entries = await this.refreshCatalog();
    return entries
      .filter(
        (entry) => entry.installStatus === "installed" && Boolean(entry.enabled),
      )
      .map((entry) => this.toPublicSkill(entry));
  }

  async listEnabledSkillSpecs() {
    const entries = await this.refreshCatalog();
    const enabledEntries = entries.filter(
      (entry) =>
        entry.installStatus === "installed" &&
        Boolean(entry.enabled) &&
        Boolean(entry.installPath),
    );

    const specs = [];

    for (const entry of enabledEntries) {
      try {
        const parsed = await parseSkillDirectory(entry.installPath, { strict: true });
        specs.push({
          id: entry.id,
          name: entry.name,
          displayName: entry.displayName,
          description: entry.description,
          source: entry.source,
          installPath: entry.installPath,
          purpose: parsed.purpose,
          trigger: parsed.trigger,
          steps: parsed.steps,
          tools: parsed.tools,
          fallback: parsed.fallback,
          triggers: {
            aliases: uniqueStrings([
              ...parsed.triggers.aliases,
              entry.displayName,
              entry.name,
            ]),
            keywords: uniqueStrings(parsed.triggers.keywords),
          },
        });
      } catch (error) {
        this.logger.warn?.(
          `[skill-manager] 解析已启用技能 "${entry.displayName}" 失败: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    return specs;
  }

  async getSkillById(id) {
    const skillId = toSafeString(id, "").trim();
    if (!skillId) {
      return null;
    }
    const entries = await this.refreshCatalog();
    const entry = entries.find((item) => item.id === skillId);
    return entry ? this.toPublicSkill(entry) : null;
  }

  async updateEntryById(skillId, updater) {
    const entries = await this.refreshCatalog();
    const index = entries.findIndex((item) => item.id === skillId);
    if (index < 0) {
      return null;
    }

    const current = entries[index];
    const next =
      typeof updater === "function"
        ? this.normalizeEntry(updater(current))
        : this.normalizeEntry({
            ...current,
            ...updater,
          });

    next.updatedAt = now();
    if (!next.createdAt) {
      next.createdAt = current.createdAt || now();
    }
    entries[index] = next;
    await this.writeRegistry(entries);
    return this.toPublicSkill(next);
  }

  async reserveInstallPath(skillName) {
    const normalizedName = slugifySkillName(skillName);
    for (let index = 0; index < 200; index += 1) {
      const suffix = index === 0 ? "" : `-${index + 1}`;
      const candidate = path.join(this.userSkillsDir, `${normalizedName}${suffix}`);
      const exists = await pathExists(candidate);
      if (!exists) {
        return candidate;
      }
    }
    throw new Error(`无法为技能预留安装路径: ${skillName}`);
  }

  normalizeZipEntryPath(entryName) {
    return toSafeString(entryName, "").replace(/\\/g, "/").trim();
  }

  validateZipEntries(entries) {
    for (const entry of entries) {
      const name = this.normalizeZipEntryPath(entry.entryName);
      if (!name) {
        continue;
      }
      if (name.startsWith("/") || name.startsWith("../") || name.includes("/../")) {
        throw new Error(`压缩包条目路径无效: ${name}`);
      }
    }
  }

  async findSkillRoot(directory) {
    const directSkillMarkdown = path.join(directory, "SKILL.md");
    if (await pathExists(directSkillMarkdown)) {
      return directory;
    }

    const queue = [{ dir: directory, depth: 0 }];
    while (queue.length > 0) {
      const current = queue.shift();
      if (!current || current.depth >= 4) {
        continue;
      }
      const dirents = await fs.readdir(current.dir, { withFileTypes: true });
      for (const dirent of dirents) {
        if (!dirent.isDirectory()) {
          continue;
        }
        const childDir = path.join(current.dir, dirent.name);
        if (await pathExists(path.join(childDir, "SKILL.md"))) {
          return childDir;
        }
        queue.push({ dir: childDir, depth: current.depth + 1 });
      }
    }

    return null;
  }

  toBuffer(data) {
    if (!data) {
      return null;
    }

    if (Buffer.isBuffer(data)) {
      return data;
    }

    if (data instanceof Uint8Array) {
      return Buffer.from(data);
    }

    if (data instanceof ArrayBuffer) {
      return Buffer.from(new Uint8Array(data));
    }

    if (Array.isArray(data)) {
      return Buffer.from(data);
    }

    if (typeof data === "object" && data.type === "Buffer" && Array.isArray(data.data)) {
      return Buffer.from(data.data);
    }

    return null;
  }

  async installBuiltinSkill(entry) {
    const sourcePath = entry.packagePath;
    if (!sourcePath || !(await pathExists(sourcePath))) {
      throw new Error(`内置技能源路径缺失: ${entry.displayName}`);
    }

    const installPath = await this.reserveInstallPath(entry.name);
    await fs.mkdir(path.dirname(installPath), { recursive: true });
    await fs.cp(sourcePath, installPath, { recursive: true, force: true });

    const parsed = await parseSkillDirectory(installPath, { strict: true });
    const updated = await this.updateEntryById(entry.id, {
      name: parsed.skillName,
      displayName: parsed.name,
      description: parsed.description,
      iconPath: parsed.iconPath,
      iconRelativePath: parsed.iconRelativePath,
      installStatus: "installed",
      enabled: true,
      installPath,
      version: parsed.version,
      triggers: uniqueStrings([
        ...parsed.triggers.aliases,
        ...parsed.triggers.keywords,
      ]),
    });

    return updated;
  }

  async installUploadedSkill(archiveBytes, fileName = "") {
    const buffer = this.toBuffer(archiveBytes);
    if (!buffer || buffer.length === 0) {
      throw new Error("上传的技能压缩包为空。");
    }

    const tempExtractDir = path.join(this.tempDir, `skill_extract_${makeId("tmp")}`);
    await fs.mkdir(tempExtractDir, { recursive: true });

    try {
      const zip = new AdmZip(buffer);
      const entries = zip.getEntries();
      if (entries.length === 0) {
        throw new Error("上传的压缩包中不包含任何文件。");
      }
      this.validateZipEntries(entries);

      zip.extractAllTo(tempExtractDir, true);

      const detectedRoot = await this.findSkillRoot(tempExtractDir);
      if (!detectedRoot) {
        throw new Error("上传的压缩包中未找到 SKILL.md。");
      }

      const parsed = await parseSkillDirectory(detectedRoot, { strict: true });
      const installPath = await this.reserveInstallPath(parsed.skillName);
      await fs.mkdir(path.dirname(installPath), { recursive: true });
      await fs.cp(detectedRoot, installPath, { recursive: true, force: true });

      const installedSpec = await parseSkillDirectory(installPath, { strict: true });
      const currentEntries = await this.refreshCatalog();
      const existing = currentEntries.find(
        (item) =>
          item.source === "upload" &&
          item.name === installedSpec.skillName &&
          item.displayName === installedSpec.name,
      );

      const entry = this.normalizeEntry({
        id: existing?.id || `upload:${installedSpec.skillName}:${makeId("id")}`,
        name: installedSpec.skillName,
        displayName: installedSpec.name,
        description: installedSpec.description,
        iconPath: installedSpec.iconPath,
        iconRelativePath: installedSpec.iconRelativePath,
        source: "upload",
        installStatus: "installed",
        enabled: true,
        installPath,
        packagePath:
          toSafeString(fileName, "").trim() ||
          `uploaded-${installedSpec.skillName}.zip`,
        version: installedSpec.version,
        triggers: uniqueStrings([
          ...installedSpec.triggers.aliases,
          ...installedSpec.triggers.keywords,
        ]),
        createdAt: existing?.createdAt || now(),
        updatedAt: now(),
      });

      const entriesAfterRefresh = await this.refreshCatalog();
      const index = entriesAfterRefresh.findIndex((item) => item.id === entry.id);
      if (index >= 0) {
        entriesAfterRefresh[index] = entry;
      } else {
        entriesAfterRefresh.push(entry);
      }
      await this.writeRegistry(entriesAfterRefresh);
      return this.toPublicSkill(entry);
    } finally {
      await fs.rm(tempExtractDir, { recursive: true, force: true });
    }
  }

  async installSkill(payload = {}) {
    const skillId = toSafeString(payload.skillId, "").trim();
    if (skillId) {
      const entry = (await this.refreshCatalog()).find((item) => item.id === skillId);
      if (!entry) {
        throw new Error(`未找到技能: ${skillId}`);
      }
      if (entry.installStatus === "installed") {
        return this.toPublicSkill(entry);
      }
      if (entry.source === "builtin") {
        return this.installBuiltinSkill(entry);
      }
      throw new Error(`该技能不能通过 id 安装: ${skillId}`);
    }

    if (payload.archiveBytes) {
      return this.installUploadedSkill(payload.archiveBytes, payload.fileName);
    }

    throw new Error("安装参数必须提供 skillId 或 archiveBytes。");
  }

  async enableSkill(skillId) {
    const id = toSafeString(skillId, "").trim();
    if (!id) {
      throw new Error("必须提供技能 id。");
    }
    const updated = await this.updateEntryById(id, (current) => {
      if (current.installStatus !== "installed") {
        throw new Error("该技能尚未安装。");
      }
      return {
        ...current,
        enabled: true,
      };
    });
    return Boolean(updated);
  }

  async disableSkill(skillId) {
    const id = toSafeString(skillId, "").trim();
    if (!id) {
      throw new Error("Skill id is required.");
    }
    const updated = await this.updateEntryById(id, {
      enabled: false,
    });
    return Boolean(updated);
  }

  async uninstallSkill(skillId) {
    const id = toSafeString(skillId, "").trim();
    if (!id) {
      throw new Error("Skill id is required.");
    }

    const entry = (await this.refreshCatalog()).find((item) => item.id === id);
    if (!entry) {
      return false;
    }

    if (entry.installPath) {
      const installPath = path.resolve(entry.installPath);
      if (isPathWithinRoot(this.userSkillsDir, installPath)) {
        await fs.rm(installPath, { recursive: true, force: true });
      }
    }

    const updated = await this.updateEntryById(id, {
      installStatus: "not_installed",
      enabled: false,
      installPath: null,
    });
    return Boolean(updated);
  }
}

module.exports = {
  SkillManager,
};
