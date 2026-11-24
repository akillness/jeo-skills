// comment-length: a comment this branch adds or changes runs three lines at most.
// example-comments: examples have no comments but tool directives.
// Prints `file:line rule message` per violation and exits 1 on any.
import { execFileSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"

const maxLines = 3
const sourceFile = /\.(ts|tsx|mts|js|mjs|vue|svelte)$/
const toolDirective =
  /^(\/\/\/|\/\/\s*(eslint|@ts-|check-code:|svelte-ignore|prettier-ignore))|^<!--\s*svelte-ignore|@__PURE__/
const exampleCode = /^examples\/(?!scripts\/|experiments\/)[^/]+\/[^/]+\//

// Files comment-length leaves alone, each with why.
const commentLengthSkips = {
  "scripts/check-code.mjs": "Its header documents every rule it checks.",
  "scripts/check-packages.mjs":
    "Its header documents everything it checks in the packed packages.",
}

const root = path.resolve(import.meta.dirname, "..")
const git = (...args) =>
  execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  })
const base = process.argv[2] ?? git("merge-base", "HEAD", "origin/main").trim()
const violations = []

checkCommentLength()
checkExampleComments()

if (violations.length) {
  console.error(
    violations
      .map(
        ({ file, line, rule, message }) => `${file}:${line} ${rule} ${message}`
      )
      .join("\n")
  )
  process.exitCode = 1
}

function checkCommentLength() {
  for (const [file, changed] of changedLines()) {
    if (file in commentLengthSkips) {
      continue
    }
    for (const comment of commentsOf(file)) {
      const lineCount = comment.end - comment.start + 1
      if (lineCount <= maxLines) {
        continue
      }
      if (
        !changed.some((line) => line >= comment.start && line <= comment.end)
      ) {
        continue
      }
      violations.push({
        file,
        line: comment.start,
        rule: "comment-length",
        message: `this comment runs ${lineCount} lines. Say why in ${maxLines} at most, or move the explanation to the docs page, a test name or contributing/.`,
      })
    }
  }
}

function checkExampleComments() {
  const files = git(
    "ls-files",
    "-z",
    "--cached",
    "--others",
    "--exclude-standard",
    "examples"
  ).split("\0")
  const examples = files.filter(
    (file) =>
      exampleCode.test(file) &&
      sourceFile.test(file) &&
      existsSync(path.join(root, file))
  )
  for (const file of examples) {
    for (const comment of commentsOf(file)) {
      violations.push({
        file,
        line: comment.start,
        rule: "example-comments",
        message:
          "examples have no comments. The docs page around the example explains it.",
      })
    }
  }
}

// Each comment's first and last line, 1-based. Runs of `//` lines count as one
// comment. JSDoc is left to check-code's public-docs and name-only-docs.
function commentsOf(file) {
  const lines = readFileSync(path.join(root, file), "utf8").split("\n")
  const comments = []
  let open
  lines.forEach((text, index) => {
    const line = text.trim()
    if (open && !open.closer && isLineComment(line)) {
      return
    }
    if (open && !open.closer) {
      comments.push(close(index - 1))
    }
    if (open?.closer) {
      if (line.includes(open.closer)) {
        comments.push(close(index))
      }
      return
    }
    open = commentStartOf(line, index, lines[index + 1]?.trim())
    if (open?.closer && line.includes(open.closer, 2)) {
      comments.push(close(index))
    }
  })
  if (open) {
    comments.push(close(lines.length - 1))
  }
  return comments

  function close(index) {
    const comment = { start: open.start + 1, end: index + 1 }
    open = undefined
    return comment
  }
}

function isLineComment(line) {
  return line.startsWith("//") && !toolDirective.test(line)
}

function commentStartOf(line, index, next) {
  if (isLineComment(line)) {
    return { start: index }
  }
  if (toolDirective.test(line)) {
    return
  }
  if (/^(\{\s*)?\/\*(?!\*)/.test(line)) {
    return { start: index, closer: "*/" }
  }
  if (
    line.startsWith("<!-- @component") ||
    (line === "<!--" && next?.startsWith("@component"))
  ) {
    return
  }
  if (line.startsWith("<!--")) {
    return { start: index, closer: "-->" }
  }
}

// The lines each source file gained since `base`, with untracked files whole.
function changedLines() {
  const changed = new Map()
  let file
  for (const line of git(
    "diff",
    "-U0",
    "--diff-filter=d",
    base,
    "--",
    "."
  ).split("\n")) {
    if (line.startsWith("+++ ")) {
      file = line.slice(6)
    }
    const hunk = line.match(/^@@ -\S+ \+(\d+)(?:,(\d+))? @@/)
    if (!hunk || !sourceFile.test(file)) {
      continue
    }
    const [start, count] = [Number(hunk[1]), Number(hunk[2] ?? 1)]
    const lines = changed.get(file) ?? []
    for (let offset = 0; offset < count; offset++) {
      lines.push(start + offset)
    }
    changed.set(file, lines)
  }
  for (const untracked of git(
    "ls-files",
    "--others",
    "--exclude-standard",
    "-z"
  ).split("\0")) {
    if (
      !sourceFile.test(untracked) ||
      !existsSync(path.join(root, untracked))
    ) {
      continue
    }
    const count = readFileSync(path.join(root, untracked), "utf8").split(
      "\n"
    ).length
    changed.set(
      untracked,
      Array.from({ length: count }, (_, index) => index + 1)
    )
  }
  return changed
}
