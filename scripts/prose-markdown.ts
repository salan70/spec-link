import MarkdownIt from "markdown-it";

type MarkdownToken = ReturnType<InstanceType<typeof MarkdownIt>["parse"]>[number];

export type ProseBlock = {
  line: number;
  paragraph: boolean;
  text: string;
  countableText: string;
};

/** Use Markdown structure so comments and code cannot change each other's boundaries. */
export function readProseBlocks(source: string): ProseBlock[] {
  const withoutFrontmatter = source.replace(
    /^\uFEFF?---[ \t]*\r?\n(?:[^\n]*\n)*?(?:---|\.\.\.)[ \t]*(?=\r?\n|$)/,
    (frontmatter) => frontmatter.replace(/[^\n]/g, ""),
  );
  const tokens = new MarkdownIt({ html: true, linkify: true }).parse(withoutFrontmatter, {});
  const blocks: ProseBlock[] = [];
  for (const [index, token] of tokens.entries()) {
    if (token.type === "inline") {
      const parent = tokens[index - 1];
      blocks.push({
        line: (token.map?.[0] ?? parent?.map?.[0] ?? 0) + 1,
        paragraph: parent?.type === "paragraph_open",
        ...readInlineText(token.children ?? []),
      });
    }
  }
  return blocks;
}

function readInlineText(tokens: MarkdownToken[]): Pick<ProseBlock, "text" | "countableText"> {
  const text: string[] = [];
  const countable: string[] = [];
  for (const [index, token] of tokens.entries()) {
    if (token.type === "code_inline") {
      text.push(token.content);
      // Treat a command or identifier as one unit; its punctuation is not prose.
      countable.push(" code ");
    } else if (token.type === "text") {
      text.push(token.content);
      const previous = tokens[index - 1];
      const isAutomaticLink =
        previous?.type === "link_open" &&
        (previous.markup === "autolink" || previous.markup === "linkify");
      countable.push(isAutomaticLink ? " link " : token.content);
    } else if (token.type === "softbreak" || token.type === "hardbreak") {
      text.push("\n");
      countable.push("\n");
    } else if (token.children !== null) {
      const child = readInlineText(token.children);
      text.push(child.text);
      countable.push(child.countableText);
    }
  }
  return { text: text.join(""), countableText: countable.join("") };
}
