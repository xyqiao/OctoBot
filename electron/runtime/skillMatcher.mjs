/**
 * Skill matching and selection utilities
 */

import { toText, normalizeText, uniqueStrings } from "./utils/textUtils.mjs";

const SKILL_TOOL_NAME_MAP = {
  office_read_document: "office_read_document",
  read_document: "office_read_document",
  office_write_document: "office_write_document",
  write_document: "office_write_document",
};

export function normalizeSkillToolName(value) {
  const raw = toText(value).trim().toLowerCase();
  if (!raw) {
    return "";
  }
  return SKILL_TOOL_NAME_MAP[raw] || raw;
}

export function normalizeSkillSpec(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const aliases = Array.isArray(source?.triggers?.aliases)
    ? source.triggers.aliases
    : [];
  const keywords = Array.isArray(source?.triggers?.keywords)
    ? source.triggers.keywords
    : [];
  const tools = Array.isArray(source.tools) ? source.tools : [];
  const fallback = Array.isArray(source.fallback) ? source.fallback : [];
  const steps = Array.isArray(source.steps) ? source.steps : [];
  const policy = source.policy && typeof source.policy === "object"
    ? source.policy
    : null;

  return {
    id: toText(source.id || "").trim(),
    name: toText(source.name || source.displayName || "").trim(),
    displayName: toText(source.displayName || source.name || "").trim(),
    description: toText(source.description || "").trim(),
    purpose: toText(source.purpose || "").trim(),
    trigger: toText(source.trigger || "").trim(),
    tools: uniqueStrings(tools.map(normalizeSkillToolName).filter(Boolean)),
    fallback: uniqueStrings(fallback),
    steps: uniqueStrings(steps),
    policy,
    triggers: {
      aliases: uniqueStrings(aliases),
      keywords: uniqueStrings(keywords),
    },
  };
}

export function hasSkillExplicitMention(promptLower, skill) {
  const names = uniqueStrings([
    skill.displayName,
    skill.name,
    ...skill.triggers.aliases,
  ]).map((item) => item.toLowerCase());

  return names.some((name) => {
    if (!name) {
      return false;
    }
    return (
      promptLower.includes(`$${name}`) ||
      promptLower.includes(`#${name}`) ||
      promptLower.includes(name)
    );
  });
}

export function computeSkillSemanticScore(promptLower, skill) {
  const tokens = uniqueStrings([
    ...skill.triggers.keywords,
    ...skill.triggers.aliases,
    ...skill.tools,
    skill.name,
    skill.displayName,
  ]).map((item) => item.toLowerCase());

  let score = 0;
  for (const token of tokens) {
    if (!token) {
      continue;
    }
    if (!promptLower.includes(token)) {
      continue;
    }
    if (skill.tools.map((item) => item.toLowerCase()).includes(token)) {
      score += 2;
      continue;
    }
    if (token.length >= 4) {
      score += 2;
    } else {
      score += 1;
    }
  }

  const purposeText = normalizeText(
    `${skill.description}\n${skill.purpose}\n${skill.trigger}`,
  );
  if (
    purposeText &&
    promptLower.includes(purposeText.slice(0, Math.min(30, purposeText.length)))
  ) {
    score += 1;
  }

  return score;
}

export function selectSkillsForPrompt(prompt, enabledSkillSpecs = [], maxSkills = 3) {
  const skills = enabledSkillSpecs
    .map(normalizeSkillSpec)
    .filter((skill) => skill.displayName || skill.name);

  if (skills.length === 0) {
    return {
      selectedSkills: [],
      matchReason: "none",
    };
  }

  const promptLower = normalizeText(prompt);
  const explicitMatches = skills.filter((skill) =>
    hasSkillExplicitMention(promptLower, skill),
  );

  const selected = [];
  const selectedIds = new Set();
  for (const skill of explicitMatches) {
    const id = skill.id || skill.name || skill.displayName;
    if (selectedIds.has(id)) {
      continue;
    }
    selected.push(skill);
    selectedIds.add(id);
    if (selected.length >= maxSkills) {
      break;
    }
  }

  const reason = selected.length > 0 ? "explicit" : "semantic";
  if (selected.length < maxSkills) {
    const semanticCandidates = skills
      .map((skill) => ({
        skill,
        score: computeSkillSemanticScore(promptLower, skill),
      }))
      .filter((item) => item.score >= 2)
      .sort((left, right) => right.score - left.score);

    for (const candidate of semanticCandidates) {
      const id =
        candidate.skill.id ||
        candidate.skill.name ||
        candidate.skill.displayName;
      if (selectedIds.has(id)) {
        continue;
      }
      selected.push(candidate.skill);
      selectedIds.add(id);
      if (selected.length >= maxSkills) {
        break;
      }
    }
  }

  return {
    selectedSkills: selected,
    matchReason: selected.length > 0 ? reason : "none",
  };
}

export function buildSkillPromptPatch(selectedSkills = []) {
  if (!Array.isArray(selectedSkills) || selectedSkills.length === 0) {
    return "";
  }

  const sections = selectedSkills.map((skill, index) => {
    const policyTools = Array.isArray(skill?.policy?.allowedTools)
      ? skill.policy.allowedTools
      : [];
    const policySteps = Array.isArray(skill?.policy?.requiredSteps)
      ? skill.policy.requiredSteps
      : [];

    return [
      `${index + 1}. ${skill.displayName || skill.name}`,
      skill.description ? `- 描述: ${skill.description}` : "",
      skill.purpose ? `- 用途: ${skill.purpose}` : "",
      skill.trigger ? `- 触发条件: ${skill.trigger}` : "",
      skill.steps.length > 0
        ? `- 执行步骤:
${skill.steps.map((step, stepIndex) => `  ${stepIndex + 1}) ${step}`).join("\n")}`
        : "",
      policySteps.length > 0
        ? `- 策略步骤:
${policySteps.map((step, stepIndex) => `  ${stepIndex + 1}) ${step}`).join("\n")}`
        : "",
      skill.tools.length > 0 ? `- 依赖工具: ${skill.tools.join(", ")}` : "",
      policyTools.length > 0 ? `- 策略工具: ${policyTools.join(", ")}` : "",
      skill.fallback.length > 0
        ? `- 失败回退:
${skill.fallback.map((item) => `  - ${item}`).join("\n")}`
        : "",
    ]
      .filter(Boolean)
      .join("\n");
  });

  return [
    "你当前必须遵循以下已匹配技能规范：",
    ...sections,
    "执行要求：严格按技能步骤执行；工具调用优先使用技能列出的依赖工具；失败时按回退策略处理并说明；同一步骤连续失败两次后停止重试并汇报阻塞原因。",
  ].join("\n\n");
}

export function collectAllowedToolsFromSkills(selectedSkills = []) {
  const tools = uniqueStrings(
    selectedSkills
      .flatMap((skill) => {
        const explicitTools = Array.isArray(skill.tools) ? skill.tools : [];
        const policyTools = Array.isArray(skill?.policy?.allowedTools)
          ? skill.policy.allowedTools
          : [];
        return [...explicitTools, ...policyTools];
      })
      .map(normalizeSkillToolName)
      .filter(Boolean),
  );
  return tools;
}

export function collectRequiredStepsFromSkills(selectedSkills = []) {
  const steps = uniqueStrings(
    selectedSkills
      .flatMap((skill) => {
        const explicitSteps = Array.isArray(skill.steps) ? skill.steps : [];
        const policySteps = Array.isArray(skill?.policy?.requiredSteps)
          ? skill.policy.requiredSteps
          : [];
        return [...explicitSteps, ...policySteps];
      })
      .filter(Boolean),
  );
  return steps;
}
