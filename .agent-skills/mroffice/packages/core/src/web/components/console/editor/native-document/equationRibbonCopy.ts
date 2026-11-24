/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
import type {
  EquationStructureId,
  EquationStructureMemberId,
} from "../extensions/equationCatalog";

export interface EquationRibbonCopy {
  tab: string;
  equation: string;
  inputFormat: string;
  unicode: string;
  latex: string;
  text: string;
  layout: string;
  professional: string;
  linear: string;
  symbols: string;
  structures: string;
  /** Word's "Change to Inline" / "Change to Display" pair. */
  placement: string;
  changeToInline: string;
  changeToDisplay: string;
  /** Word's tab on the right edge of the equation container. */
  equationOptions: string;
  unavailableStructure: string;
  unsupportedUnicode: string;
  /** The LaTeX source cannot be read (unfinished, or a mistake). */
  invalidLatex: string;
  unsupportedText: string;
  unsupportedPlacement: string;
  readonly: string;
  structureLabels: Readonly<Record<EquationStructureId, string>>;
  structureMemberLabels: Readonly<Record<EquationStructureMemberId, string>>;
}

/** The equation ribbon's words, resolved from `console-notebooks` keys. */
export function equationRibbonCopy(
  t: (key: string) => string,
): EquationRibbonCopy {
  const k = (leaf: string) => t(`equation.ribbon.${leaf}`);
  return {
    tab: k("tab"),
    equation: k("equation"),
    inputFormat: k("inputFormat"),
    unicode: k("unicode"),
    latex: k("latex"),
    text: k("text"),
    layout: k("layout"),
    professional: k("professional"),
    linear: k("linear"),
    symbols: k("symbols"),
    structures: k("structures"),
    placement: k("placement"),
    changeToInline: k("changeToInline"),
    changeToDisplay: k("changeToDisplay"),
    equationOptions: k("equationOptions"),
    unavailableStructure: k("unavailableStructure"),
    unsupportedUnicode: k("unsupportedUnicode"),
    invalidLatex: k("invalidLatex"),
    unsupportedText: k("unsupportedText"),
    unsupportedPlacement: k("unsupportedPlacement"),
    readonly: k("readonly"),
    structureLabels: {
      fraction: k("structureLabels.fraction"),
      script: k("structureLabels.script"),
      radical: k("structureLabels.radical"),
      integral: k("structureLabels.integral"),
      largeOperator: k("structureLabels.largeOperator"),
      bracket: k("structureLabels.bracket"),
      function: k("structureLabels.function"),
      accent: k("structureLabels.accent"),
      limitLog: k("structureLabels.limitLog"),
      operator: k("structureLabels.operator"),
      matrix: k("structureLabels.matrix"),
    },
    structureMemberLabels: {
      "fraction.stacked": k("structureMemberLabels.fraction.stacked"),
      "fraction.skewed": k("structureMemberLabels.fraction.skewed"),
      "fraction.linear": k("structureMemberLabels.fraction.linear"),
      "script.subscript": k("structureMemberLabels.script.subscript"),
      "script.superscript": k("structureMemberLabels.script.superscript"),
      "script.subSup": k("structureMemberLabels.script.subSup"),
      "script.prescript": k("structureMemberLabels.script.prescript"),
      "radical.squareRoot": k("structureMemberLabels.radical.squareRoot"),
      "radical.nthRoot": k("structureMemberLabels.radical.nthRoot"),
      "integral.single": k("structureMemberLabels.integral.single"),
      "integral.double": k("structureMemberLabels.integral.double"),
      "integral.contour": k("structureMemberLabels.integral.contour"),
      "largeOperator.sum": k("structureMemberLabels.largeOperator.sum"),
      "largeOperator.product": k("structureMemberLabels.largeOperator.product"),
      "bracket.parentheses": k("structureMemberLabels.bracket.parentheses"),
      "bracket.square": k("structureMemberLabels.bracket.square"),
      "bracket.braces": k("structureMemberLabels.bracket.braces"),
      "bracket.absolute": k("structureMemberLabels.bracket.absolute"),
      "function.sin": k("structureMemberLabels.function.sin"),
      "function.cos": k("structureMemberLabels.function.cos"),
      "function.log": k("structureMemberLabels.function.log"),
      "accent.hat": k("structureMemberLabels.accent.hat"),
      "accent.bar": k("structureMemberLabels.accent.bar"),
      "accent.vector": k("structureMemberLabels.accent.vector"),
      "limitLog.limit": k("structureMemberLabels.limitLog.limit"),
      "limitLog.logBase": k("structureMemberLabels.limitLog.logBase"),
      "operator.multiply": k("structureMemberLabels.operator.multiply"),
      "operator.divide": k("structureMemberLabels.operator.divide"),
      "operator.plusMinus": k("structureMemberLabels.operator.plusMinus"),
      "operator.dot": k("structureMemberLabels.operator.dot"),
      "matrix.twoByTwo": k("structureMemberLabels.matrix.twoByTwo"),
      "matrix.threeByThree": k("structureMemberLabels.matrix.threeByThree"),
      "matrix.determinant": k("structureMemberLabels.matrix.determinant"),
      "matrix.cases": k("structureMemberLabels.matrix.cases"),
      "fraction.small": k("structureMemberLabels.fraction.small"),
      "fraction.display": k("structureMemberLabels.fraction.display"),
      "fraction.continued": k("structureMemberLabels.fraction.continued"),
      "fraction.binomial": k("structureMemberLabels.fraction.binomial"),
      "fraction.derivative": k("structureMemberLabels.fraction.derivative"),
      "fraction.partialDerivative": k("structureMemberLabels.fraction.partialDerivative"),
      "script.leftSubscript": k("structureMemberLabels.script.leftSubscript"),
      "script.leftSuperscript": k("structureMemberLabels.script.leftSuperscript"),
      "script.under": k("structureMemberLabels.script.under"),
      "script.over": k("structureMemberLabels.script.over"),
      "radical.cubeRoot": k("structureMemberLabels.radical.cubeRoot"),
      "radical.fourthRoot": k("structureMemberLabels.radical.fourthRoot"),
      "radical.nested": k("structureMemberLabels.radical.nested"),
      "radical.quotient": k("structureMemberLabels.radical.quotient"),
      "integral.differentialX": k("structureMemberLabels.integral.differentialX"),
      "integral.differentialY": k("structureMemberLabels.integral.differentialY"),
      "integral.differentialTheta": k("structureMemberLabels.integral.differentialTheta"),
      "integral.surface": k("structureMemberLabels.integral.surface"),
      "integral.volume": k("structureMemberLabels.integral.volume"),
      "bracket.angle": k("structureMemberLabels.bracket.angle"),
      "bracket.norm": k("structureMemberLabels.bracket.norm"),
      "bracket.floor": k("structureMemberLabels.bracket.floor"),
      "bracket.ceiling": k("structureMemberLabels.bracket.ceiling"),
      "bracket.leftParenthesis": k("structureMemberLabels.bracket.leftParenthesis"),
      "bracket.leftSquare": k("structureMemberLabels.bracket.leftSquare"),
      "bracket.leftBrace": k("structureMemberLabels.bracket.leftBrace"),
      "bracket.leftBar": k("structureMemberLabels.bracket.leftBar"),
      "bracket.rightParenthesis": k("structureMemberLabels.bracket.rightParenthesis"),
      "bracket.rightSquare": k("structureMemberLabels.bracket.rightSquare"),
      "bracket.rightBrace": k("structureMemberLabels.bracket.rightBrace"),
      "bracket.rightBar": k("structureMemberLabels.bracket.rightBar"),
      "bracket.parenthesesSeparator": k("structureMemberLabels.bracket.parenthesesSeparator"),
      "bracket.bracesSeparator": k("structureMemberLabels.bracket.bracesSeparator"),
      "bracket.angleSeparator": k("structureMemberLabels.bracket.angleSeparator"),
      "bracket.parenthesesStack": k("structureMemberLabels.bracket.parenthesesStack"),
      "bracket.squareStack": k("structureMemberLabels.bracket.squareStack"),
      "bracket.bracesStack": k("structureMemberLabels.bracket.bracesStack"),
      "bracket.absoluteStack": k("structureMemberLabels.bracket.absoluteStack"),
      "bracket.cases": k("structureMemberLabels.bracket.cases"),
      "bracket.binomial": k("structureMemberLabels.bracket.binomial"),
      "bracket.squareBinomial": k("structureMemberLabels.bracket.squareBinomial"),
      "function.exp": k("structureMemberLabels.function.exp"),
      "function.ln": k("structureMemberLabels.function.ln"),
      "accent.wideHat": k("structureMemberLabels.accent.wideHat"),
      "accent.tilde": k("structureMemberLabels.accent.tilde"),
      "accent.wideTilde": k("structureMemberLabels.accent.wideTilde"),
      "accent.overline": k("structureMemberLabels.accent.overline"),
      "accent.underline": k("structureMemberLabels.accent.underline"),
      "accent.dot": k("structureMemberLabels.accent.dot"),
      "accent.doubleDot": k("structureMemberLabels.accent.doubleDot"),
      "accent.breve": k("structureMemberLabels.accent.breve"),
      "accent.check": k("structureMemberLabels.accent.check"),
      "accent.acute": k("structureMemberLabels.accent.acute"),
      "accent.grave": k("structureMemberLabels.accent.grave"),
      "accent.ring": k("structureMemberLabels.accent.ring"),
      "accent.rightArrow": k("structureMemberLabels.accent.rightArrow"),
      "accent.leftArrow": k("structureMemberLabels.accent.leftArrow"),
      "accent.leftRightArrow": k("structureMemberLabels.accent.leftRightArrow"),
      "accent.overbrace": k("structureMemberLabels.accent.overbrace"),
      "accent.overbraceLabel": k("structureMemberLabels.accent.overbraceLabel"),
      "accent.underbrace": k("structureMemberLabels.accent.underbrace"),
      "accent.underbraceLabel": k("structureMemberLabels.accent.underbraceLabel"),
      "accent.overset": k("structureMemberLabels.accent.overset"),
      "accent.underset": k("structureMemberLabels.accent.underset"),
      "accent.boxed": k("structureMemberLabels.accent.boxed"),
      "accent.doubleOverline": k("structureMemberLabels.accent.doubleOverline"),
      "accent.boxedEquation": k("structureMemberLabels.accent.boxedEquation"),
      "limitLog.limitInfinity": k("structureMemberLabels.limitLog.limitInfinity"),
      "limitLog.limitRight": k("structureMemberLabels.limitLog.limitRight"),
      "limitLog.limitLeft": k("structureMemberLabels.limitLog.limitLeft"),
      "limitLog.log": k("structureMemberLabels.limitLog.log"),
      "limitLog.naturalLog": k("structureMemberLabels.limitLog.naturalLog"),
      "limitLog.minimum": k("structureMemberLabels.limitLog.minimum"),
      "limitLog.maximum": k("structureMemberLabels.limitLog.maximum"),
      "operator.equals": k("structureMemberLabels.operator.equals"),
      "operator.notEquals": k("structureMemberLabels.operator.notEquals"),
      "operator.equivalent": k("structureMemberLabels.operator.equivalent"),
      "operator.approximately": k("structureMemberLabels.operator.approximately"),
      "operator.proportional": k("structureMemberLabels.operator.proportional"),
      "operator.assignment": k("structureMemberLabels.operator.assignment"),
      "operator.definition": k("structureMemberLabels.operator.definition"),
      "operator.deltaEquals": k("structureMemberLabels.operator.deltaEquals"),
      "operator.leftArrow": k("structureMemberLabels.operator.leftArrow"),
      "operator.rightArrow": k("structureMemberLabels.operator.rightArrow"),
      "operator.leftRightArrow": k("structureMemberLabels.operator.leftRightArrow"),
      "operator.doubleLeft": k("structureMemberLabels.operator.doubleLeft"),
      "operator.doubleRight": k("structureMemberLabels.operator.doubleRight"),
      "operator.doubleBoth": k("structureMemberLabels.operator.doubleBoth"),
      "operator.mapsTo": k("structureMemberLabels.operator.mapsTo"),
      "operator.longRight": k("structureMemberLabels.operator.longRight"),
      "operator.labelledRight": k("structureMemberLabels.operator.labelledRight"),
      "matrix.blankOne": k("structureMemberLabels.matrix.blankOne"),
      "matrix.blankRowTwo": k("structureMemberLabels.matrix.blankRowTwo"),
      "matrix.blankColumnTwo": k("structureMemberLabels.matrix.blankColumnTwo"),
      "matrix.blankTwo": k("structureMemberLabels.matrix.blankTwo"),
      "matrix.blankTwoByThree": k("structureMemberLabels.matrix.blankTwoByThree"),
      "matrix.blankThreeByTwo": k("structureMemberLabels.matrix.blankThreeByTwo"),
      "matrix.blankThree": k("structureMemberLabels.matrix.blankThree"),
      "matrix.rowThree": k("structureMemberLabels.matrix.rowThree"),
      "matrix.columnThree": k("structureMemberLabels.matrix.columnThree"),
      "matrix.rowFour": k("structureMemberLabels.matrix.rowFour"),
      "matrix.columnFour": k("structureMemberLabels.matrix.columnFour"),
      "matrix.horizontalEllipsis": k("structureMemberLabels.matrix.horizontalEllipsis"),
      "matrix.verticalEllipsis": k("structureMemberLabels.matrix.verticalEllipsis"),
      "matrix.diagonalEllipsis": k("structureMemberLabels.matrix.diagonalEllipsis"),
      "matrix.antiDiagonalEllipsis": k("structureMemberLabels.matrix.antiDiagonalEllipsis"),
      "matrix.identityTwo": k("structureMemberLabels.matrix.identityTwo"),
      "matrix.identityThree": k("structureMemberLabels.matrix.identityThree"),
      "matrix.parenthesesTwo": k("structureMemberLabels.matrix.parenthesesTwo"),
      "matrix.bracesTwo": k("structureMemberLabels.matrix.bracesTwo"),
    },
  };
}
