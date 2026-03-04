import { type ComponentProps, type FC } from "react";
import type { EmptyMessagePartProps } from "@assistant-ui/react";
import { makeMarkdownText } from "@assistant-ui/react-ui";
import { PrismLight as ReactSyntaxHighlighter } from "react-syntax-highlighter";
import langBash from "react-syntax-highlighter/dist/esm/languages/prism/bash";
import langCss from "react-syntax-highlighter/dist/esm/languages/prism/css";
import langJavascript from "react-syntax-highlighter/dist/esm/languages/prism/javascript";
import langJson from "react-syntax-highlighter/dist/esm/languages/prism/json";
import langJsx from "react-syntax-highlighter/dist/esm/languages/prism/jsx";
import langMarkdown from "react-syntax-highlighter/dist/esm/languages/prism/markdown";
import langMarkup from "react-syntax-highlighter/dist/esm/languages/prism/markup";
import langPython from "react-syntax-highlighter/dist/esm/languages/prism/python";
import langSql from "react-syntax-highlighter/dist/esm/languages/prism/sql";
import langTsx from "react-syntax-highlighter/dist/esm/languages/prism/tsx";
import langTypescript from "react-syntax-highlighter/dist/esm/languages/prism/typescript";
import langYaml from "react-syntax-highlighter/dist/esm/languages/prism/yaml";
import oneDark from "react-syntax-highlighter/dist/esm/styles/prism/one-dark";
import remarkGfm from "remark-gfm";

const prismLanguageAliases: Record<string, string> = {
  js: "javascript",
  jsx: "jsx",
  ts: "typescript",
  tsx: "tsx",
  json: "json",
  jsonc: "json",
  json5: "json",
  sh: "bash",
  shell: "bash",
  zsh: "bash",
  bash: "bash",
  py: "python",
  python: "python",
  sql: "sql",
  css: "css",
  html: "markup",
  xml: "markup",
  md: "markdown",
  markdown: "markdown",
  yml: "yaml",
  yaml: "yaml",
};

ReactSyntaxHighlighter.registerLanguage("javascript", langJavascript);
ReactSyntaxHighlighter.registerLanguage("jsx", langJsx);
ReactSyntaxHighlighter.registerLanguage("typescript", langTypescript);
ReactSyntaxHighlighter.registerLanguage("tsx", langTsx);
ReactSyntaxHighlighter.registerLanguage("json", langJson);
ReactSyntaxHighlighter.registerLanguage("bash", langBash);
ReactSyntaxHighlighter.registerLanguage("python", langPython);
ReactSyntaxHighlighter.registerLanguage("sql", langSql);
ReactSyntaxHighlighter.registerLanguage("css", langCss);
ReactSyntaxHighlighter.registerLanguage("markup", langMarkup);
ReactSyntaxHighlighter.registerLanguage("markdown", langMarkdown);
ReactSyntaxHighlighter.registerLanguage("yaml", langYaml);

type MarkdownTextComponents = NonNullable<
  NonNullable<Parameters<typeof makeMarkdownText>[0]>["components"]
>;
type MarkdownSyntaxHighlighterProps = ComponentProps<
  NonNullable<MarkdownTextComponents["SyntaxHighlighter"]>
>;

function normalizePrismLanguage(language?: string) {
  if (!language) {
    return "";
  }
  const key = language.toLowerCase().trim();
  return prismLanguageAliases[key] ?? key;
}

const MarkdownSyntaxHighlighter = ({
  components,
  language,
  code,
}: MarkdownSyntaxHighlighterProps) => {
  const { Pre, Code } = components;
  const normalizedLanguage = normalizePrismLanguage(language);

  if (!normalizedLanguage) {
    return (
      <Pre>
        <Code>{code}</Code>
      </Pre>
    );
  }

  return (
    <ReactSyntaxHighlighter
      language={normalizedLanguage}
      style={oneDark}
      PreTag={Pre as never}
      CodeTag={Code as never}
      customStyle={{
        margin: 0,
        borderTopLeftRadius: 0,
        borderTopRightRadius: 0,
      }}
    >
      {code}
    </ReactSyntaxHighlighter>
  );
};

export const MarkdownText = makeMarkdownText({
  remarkPlugins: [remarkGfm],
  components: {
    SyntaxHighlighter: MarkdownSyntaxHighlighter,
  },
});

export const ThinkingText: FC<EmptyMessagePartProps> = ({ status }) => {
  if (status.type !== "running") {
    return null;
  }

  return (
    <span className="nexus-thinking">
      思考中
      <span className="nexus-thinking-dots" aria-hidden="true">
        ...
      </span>
    </span>
  );
};
