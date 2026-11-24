"use client";

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The LaTeX compile menu, as Overleaf's Recompile menu and its Compiler
 * setting: Auto compile (lib/code-runner/latex-auto-compile), the compile
 * mode (Normal, or Fast [draft]: lib/code-runner/latex-draft-mode), the
 * engine (Auto, pdfLaTeX, XeLaTeX, LuaLaTeX, LaTeX) and "Recompile from
 * scratch".
 * The engine is the main file's own
 * `% !TEX program` line (lib/code-runner/latex-compiler), so choosing one
 * edits the file and a hand-edited line shows here.
 *
 * Only the items: the Code window puts them in the title bar's menu beside
 * Run and in the Run tab's Compiler menu.
 */

import { useTranslations } from "@mrnote/core/host/next-intl.tsx";

import {
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
} from "@mrnote/core/web/components/ui/dropdown-menu.tsx";
import {
  LATEX_COMPILER_CHOICES,
  type LatexCompilerChoice,
  type LatexEngine,
} from "../../../../lib/code-runner/latex-compiler";
import { CodeRibbonIcon } from "./CodeRibbonIcons";
import { outputStyles } from "./codeOutputChrome";

/** The engines' own names, as TeX distributions and Overleaf write them. */
const ENGINE_NAMES: Readonly<Record<LatexEngine, string>> = {
  pdflatex: "pdfLaTeX",
  xelatex: "XeLaTeX",
  lualatex: "LuaLaTeX",
  latex: "LaTeX (DVI)",
};

export function latexCompilerLabel(
  choice: LatexCompilerChoice,
  t: (key: string) => string,
): string {
  return choice === "auto" ? t("codeOutput.latex.compilerAuto") : ENGINE_NAMES[choice];
}

export function LatexCompileMenuItems({
  autoCompile,
  onAutoCompileChange,
  draftMode,
  onDraftModeChange,
  figureCache,
  onFigureCacheChange,
  choice,
  program,
  onChoose,
  chooseDisabledReason,
  modeDisabledReason,
  onRecompileFromScratch,
  recompileDisabledReason,
  testIdPrefix,
}: {
  /** Overleaf's Auto compile switch, the member's own (off by default). */
  autoCompile: boolean;
  onAutoCompileChange: (on: boolean) => void;
  /** Fast [draft] mode: images drawn as boxes. The page's own, in this browser. */
  draftMode: boolean;
  onDraftModeChange: (on: boolean) => void;
  /** Cache TikZ figures (TikZ's external library), the page's own too. */
  figureCache: boolean;
  onFigureCacheChange: (on: boolean) => void;
  /** The file's engine; null when its line names one the compile lacks. */
  choice: LatexCompilerChoice | null;
  /** The engine the line names, shown when `choice` is null. */
  program: string;
  onChoose: (choice: LatexCompilerChoice) => void;
  /** Why the file cannot be edited now (read-only, running). */
  chooseDisabledReason?: string;
  /**
   * Why the compile mode (fast draft, figure cache) cannot change: an Agent's
   * draft under review compiles exactly the source Confirm will create.
   */
  modeDisabledReason?: string;
  onRecompileFromScratch: () => void;
  recompileDisabledReason?: string;
  testIdPrefix: string;
}) {
  const t = useTranslations("console-notebooks");
  const recompileLabel = t("codeOutput.latex.recompileFromScratch");
  return (
    <>
      <DropdownMenuCheckboxItem
        checked={autoCompile}
        onCheckedChange={(checked) => onAutoCompileChange(checked === true)}
        title={t("codeOutput.latex.autoCompileHint")}
        data-testid={`${testIdPrefix}-auto-compile`}
      >
        {t("codeOutput.latex.autoCompile")}
      </DropdownMenuCheckboxItem>
      <DropdownMenuSeparator />
      <DropdownMenuLabel className="docs-cupertino-menu__heading">
        {t("codeOutput.latex.compileMode")}
      </DropdownMenuLabel>
      <DropdownMenuRadioGroup
        value={draftMode ? "draft" : "normal"}
        onValueChange={(value) => onDraftModeChange(value === "draft")}
      >
        <DropdownMenuRadioItem
          value="normal"
          disabled={modeDisabledReason !== undefined}
          title={modeDisabledReason}
          data-disabled-reason={modeDisabledReason}
          data-testid={`${testIdPrefix}-mode-normal`}
        >
          {t("codeOutput.latex.compileModeNormal")}
        </DropdownMenuRadioItem>
        <DropdownMenuRadioItem
          value="draft"
          disabled={modeDisabledReason !== undefined}
          title={modeDisabledReason ?? t("codeOutput.latex.compileModeDraftHint")}
          data-disabled-reason={modeDisabledReason}
          data-testid={`${testIdPrefix}-mode-draft`}
        >
          {t("codeOutput.latex.compileModeDraft")}
        </DropdownMenuRadioItem>
      </DropdownMenuRadioGroup>
      <DropdownMenuCheckboxItem
        checked={figureCache}
        onCheckedChange={(checked) => onFigureCacheChange(checked === true)}
        disabled={modeDisabledReason !== undefined}
        title={modeDisabledReason ?? t("codeOutput.latex.figureCacheHint")}
        data-disabled-reason={modeDisabledReason}
        data-testid={`${testIdPrefix}-figure-cache`}
      >
        {t("codeOutput.latex.figureCache")}
      </DropdownMenuCheckboxItem>
      <DropdownMenuSeparator />
      <DropdownMenuLabel className="docs-cupertino-menu__heading">
        {t("codeOutput.latex.compiler")}
      </DropdownMenuLabel>
      {choice === null ? (
        <DropdownMenuLabel
          role="note"
          data-testid={`${testIdPrefix}-compiler-unsupported`}
          className={`docs-cupertino-menu__rich-detail ${outputStyles.menuNote}`}
        >
          {t("codeOutput.latex.compilerUnsupported", { engine: program })}
        </DropdownMenuLabel>
      ) : null}
      <DropdownMenuRadioGroup
        value={choice ?? ""}
        onValueChange={(value) => {
          if ((LATEX_COMPILER_CHOICES as readonly string[]).includes(value)) {
            onChoose(value as LatexCompilerChoice);
          }
        }}
      >
        {LATEX_COMPILER_CHOICES.map((option) => (
          <DropdownMenuRadioItem
            key={option}
            value={option}
            disabled={chooseDisabledReason !== undefined}
            title={chooseDisabledReason ?? t("codeOutput.latex.compilerHint")}
            data-disabled-reason={chooseDisabledReason}
            data-testid={`${testIdPrefix}-compiler-${option}`}
          >
            {latexCompilerLabel(option, t)}
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        onSelect={onRecompileFromScratch}
        disabled={recompileDisabledReason !== undefined}
        title={
          recompileDisabledReason
            ? `${recompileLabel}: ${recompileDisabledReason}`
            : t("codeOutput.latex.recompileFromScratchHint")
        }
        data-disabled-reason={recompileDisabledReason}
        data-testid={`${testIdPrefix}-recompile-from-scratch`}
      >
        <CodeRibbonIcon name="recompileFromScratch" size={14} />
        {recompileLabel}
      </DropdownMenuItem>
    </>
  );
}
