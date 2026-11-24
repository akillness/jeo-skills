/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The starter sources a Mermaid diagram and a code chart are inserted with,
 * and the templates their source editors offer, written in the viewer's
 * interface language (`contentLocaleOf`). The words become the document's own
 * text when the block goes in and are never re-translated afterwards.
 *
 * Chinese keeps the literal sources these blocks were born with
 * (`MERMAID_STARTER_SOURCE`, `MERMAID_TEMPLATES`, `CODE_CHART_STARTER_SOURCE`,
 * `CODE_CHART_TEMPLATES`), byte for byte; every other language is built here
 * from the same diagram with its own words. Mermaid identifiers that cannot
 * hold a word with spaces (a sequence participant, a state) take a short id
 * and show the word as its label. The code charts' plot titles stay English:
 * the sandbox's matplotlib has no CJK font, so only their comments change.
 */

import { contentLocaleOf, type ContentLocale } from "@mrnote/core/web/lib/i18n/content-locale.ts";

export type MermaidTemplateId = "flowchart" | "sequence" | "gantt" | "state" | "er" | "pie";
export type CodeChartTemplateId = "bar" | "line" | "scatter" | "pie";

interface MermaidWords {
  /** The flowchart's comment; "{edit}" is the Edit source button's name. */
  readonly flowComment: string;
  readonly sequenceComment: string;
  readonly ganttComment: string;
  readonly stateComment: string;
  readonly erComment: string;
  readonly pieComment: string;
  readonly edit: string;
  readonly start: string;
  readonly approved: string;
  readonly yes: string;
  readonly no: string;
  readonly next: string;
  readonly revise: string;
  readonly end: string;
  readonly user: string;
  readonly system: string;
  readonly request: string;
  readonly result: string;
  readonly plan: string;
  readonly phase1: string;
  readonly phase2: string;
  readonly analysis: string;
  readonly design: string;
  readonly build: string;
  readonly test: string;
  readonly todo: string;
  readonly doing: string;
  readonly done: string;
  readonly begin: string;
  readonly finish: string;
  readonly places: string;
  readonly contains: string;
  readonly share: string;
  readonly productA: string;
  readonly productB: string;
  readonly other: string;
}

interface CodeChartWords {
  /** The bar starter's two opening comment lines; "{run}" is the Run button. */
  readonly barIntro: readonly [string, string];
  readonly run: string;
  readonly noClose: string;
  readonly line: string;
  readonly scatter: string;
  readonly seed: string;
  readonly pie: string;
  readonly captured: string;
}

type Translated<T> = Readonly<Record<Exclude<ContentLocale, "zh">, T>>;

const MERMAID_WORDS: Translated<MermaidWords> = {
  en: {
    flowComment: "Sample flowchart: click “{edit}” below to change it", sequenceComment: "Sample sequence diagram",
    ganttComment: "Sample Gantt chart", stateComment: "Sample state diagram", erComment: "Sample ER diagram (entity relationships)",
    pieComment: "Sample pie chart", edit: "Edit source", start: "Start", approved: "Approved?", yes: "Yes", no: "No",
    next: "Go to next step", revise: "Send back for changes", end: "End", user: "User", system: "System",
    request: "Send request", result: "Return result", plan: "Project plan", phase1: "Phase 1", phase2: "Phase 2",
    analysis: "Requirements", design: "Design", build: "Development", test: "Testing", todo: "To do",
    doing: "In progress", done: "Done", begin: "Start", finish: "Finish", places: "places", contains: "contains",
    share: "Market share", productA: "Product A", productB: "Product B", other: "Other",
  },
  "zh-TW": {
    flowComment: "範例流程圖：按一下下方「{edit}」修改", sequenceComment: "範例循序圖", ganttComment: "範例甘特圖",
    stateComment: "範例狀態圖", erComment: "範例 ER 圖（實體關聯）", pieComment: "範例圓形圖", edit: "編輯原始碼",
    start: "開始", approved: "審核通過?", yes: "是", no: "否", next: "執行下一步", revise: "退回修改", end: "結束",
    user: "使用者", system: "系統", request: "傳送要求", result: "傳回結果", plan: "專案計畫", phase1: "階段一",
    phase2: "階段二", analysis: "需求分析", design: "方案設計", build: "開發實作", test: "測試驗收", todo: "待處理",
    doing: "進行中", done: "已完成", begin: "開始", finish: "完成", places: "下單", contains: "包含", share: "市場占有率",
    productA: "產品甲", productB: "產品乙", other: "其他",
  },
  ja: {
    flowComment: "サンプルのフローチャート: 下の「{edit}」で変更できます", sequenceComment: "サンプルのシーケンス図",
    ganttComment: "サンプルのガント チャート", stateComment: "サンプルの状態遷移図", erComment: "サンプルの ER 図 (エンティティの関係)",
    pieComment: "サンプルの円グラフ", edit: "ソースの編集", start: "開始", approved: "承認?", yes: "はい", no: "いいえ",
    next: "次のステップへ", revise: "差し戻し", end: "終了", user: "ユーザー", system: "システム", request: "リクエスト送信",
    result: "結果を返す", plan: "プロジェクト計画", phase1: "フェーズ 1", phase2: "フェーズ 2", analysis: "要件分析",
    design: "設計", build: "開発", test: "テストと検収", todo: "未着手", doing: "進行中", done: "完了", begin: "開始",
    finish: "完了", places: "注文する", contains: "含む", share: "市場シェア", productA: "製品 A", productB: "製品 B", other: "その他",
  },
  ko: {
    flowComment: "샘플 순서도: 아래 '{edit}'를 클릭해 수정하세요", sequenceComment: "샘플 시퀀스 다이어그램",
    ganttComment: "샘플 간트 차트", stateComment: "샘플 상태 다이어그램", erComment: "샘플 ER 다이어그램(엔터티 관계)",
    pieComment: "샘플 원형 차트", edit: "소스 편집", start: "시작", approved: "승인?", yes: "예", no: "아니요",
    next: "다음 단계 진행", revise: "반려 후 수정", end: "종료", user: "사용자", system: "시스템", request: "요청 보내기",
    result: "결과 반환", plan: "프로젝트 계획", phase1: "1단계", phase2: "2단계", analysis: "요구 사항 분석", design: "설계",
    build: "개발", test: "테스트 및 검수", todo: "대기", doing: "진행 중", done: "완료", begin: "시작", finish: "완료",
    places: "주문", contains: "포함", share: "시장 점유율", productA: "제품 A", productB: "제품 B", other: "기타",
  },
  de: {
    flowComment: "Beispiel-Flussdiagramm: zum Ändern unten auf „{edit}“ klicken", sequenceComment: "Beispiel-Sequenzdiagramm",
    ganttComment: "Beispiel-Gantt-Diagramm", stateComment: "Beispiel-Zustandsdiagramm", erComment: "Beispiel-ER-Diagramm (Entitätsbeziehungen)",
    pieComment: "Beispiel-Kreisdiagramm", edit: "Quelltext bearbeiten", start: "Start", approved: "Genehmigt?", yes: "Ja",
    no: "Nein", next: "Nächster Schritt", revise: "Zur Überarbeitung zurück", end: "Ende", user: "Benutzer", system: "System",
    request: "Anfrage senden", result: "Ergebnis zurückgeben", plan: "Projektplan", phase1: "Phase 1", phase2: "Phase 2",
    analysis: "Anforderungsanalyse", design: "Entwurf", build: "Entwicklung", test: "Test und Abnahme", todo: "Offen",
    doing: "In Arbeit", done: "Erledigt", begin: "Beginnen", finish: "Abschließen", places: "bestellt", contains: "enthält",
    share: "Marktanteil", productA: "Produkt A", productB: "Produkt B", other: "Sonstige",
  },
  fr: {
    flowComment: "Exemple d’organigramme : cliquez sur « {edit} » ci-dessous pour le modifier", sequenceComment: "Exemple de diagramme de séquence",
    ganttComment: "Exemple de diagramme de Gantt", stateComment: "Exemple de diagramme d’états", erComment: "Exemple de diagramme entité-association",
    pieComment: "Exemple de graphique en secteurs", edit: "Modifier la source", start: "Début", approved: "Approuvé ?", yes: "Oui",
    no: "Non", next: "Étape suivante", revise: "Renvoyer pour correction", end: "Fin", user: "Utilisateur", system: "Système",
    request: "Envoyer la requête", result: "Renvoyer le résultat", plan: "Plan du projet", phase1: "Phase 1", phase2: "Phase 2",
    analysis: "Analyse des besoins", design: "Conception", build: "Développement", test: "Tests et recette", todo: "À faire",
    doing: "En cours", done: "Terminé", begin: "Commencer", finish: "Terminer", places: "passe", contains: "contient",
    share: "Part de marché", productA: "Produit A", productB: "Produit B", other: "Autres",
  },
  es: {
    flowComment: "Diagrama de flujo de ejemplo: haga clic en «{edit}» abajo para modificarlo", sequenceComment: "Diagrama de secuencia de ejemplo",
    ganttComment: "Diagrama de Gantt de ejemplo", stateComment: "Diagrama de estados de ejemplo", erComment: "Diagrama ER de ejemplo (relaciones entre entidades)",
    pieComment: "Gráfico circular de ejemplo", edit: "Editar código fuente", start: "Inicio", approved: "¿Aprobado?", yes: "Sí",
    no: "No", next: "Siguiente paso", revise: "Devolver para corregir", end: "Fin", user: "Usuario", system: "Sistema",
    request: "Enviar solicitud", result: "Devolver resultado", plan: "Plan del proyecto", phase1: "Fase 1", phase2: "Fase 2",
    analysis: "Análisis de requisitos", design: "Diseño", build: "Desarrollo", test: "Pruebas y aceptación", todo: "Pendiente",
    doing: "En curso", done: "Completado", begin: "Empezar", finish: "Terminar", places: "realiza", contains: "contiene",
    share: "Cuota de mercado", productA: "Producto A", productB: "Producto B", other: "Otros",
  },
  it: {
    flowComment: "Diagramma di flusso di esempio: fai clic su «{edit}» qui sotto per modificarlo", sequenceComment: "Diagramma di sequenza di esempio",
    ganttComment: "Diagramma di Gantt di esempio", stateComment: "Diagramma di stato di esempio", erComment: "Diagramma ER di esempio (relazioni tra entità)",
    pieComment: "Grafico a torta di esempio", edit: "Modifica codice sorgente", start: "Inizio", approved: "Approvato?", yes: "Sì",
    no: "No", next: "Passo successivo", revise: "Rimanda per modifiche", end: "Fine", user: "Utente", system: "Sistema",
    request: "Invia richiesta", result: "Restituisci risultato", plan: "Piano del progetto", phase1: "Fase 1", phase2: "Fase 2",
    analysis: "Analisi dei requisiti", design: "Progettazione", build: "Sviluppo", test: "Test e collaudo", todo: "Da fare",
    doing: "In corso", done: "Completato", begin: "Inizia", finish: "Completa", places: "effettua", contains: "contiene",
    share: "Quota di mercato", productA: "Prodotto A", productB: "Prodotto B", other: "Altro",
  },
  nl: {
    flowComment: "Voorbeeldstroomdiagram: klik hieronder op ‘{edit}’ om het te wijzigen", sequenceComment: "Voorbeeldsequentiediagram",
    ganttComment: "Voorbeeld-Gantt-diagram", stateComment: "Voorbeeldtoestandsdiagram", erComment: "Voorbeeld-ER-diagram (entiteitsrelaties)",
    pieComment: "Voorbeeldcirkeldiagram", edit: "Bron bewerken", start: "Start", approved: "Goedgekeurd?", yes: "Ja", no: "Nee",
    next: "Volgende stap", revise: "Terug ter aanpassing", end: "Einde", user: "Gebruiker", system: "Systeem",
    request: "Verzoek sturen", result: "Resultaat terugsturen", plan: "Projectplan", phase1: "Fase 1", phase2: "Fase 2",
    analysis: "Behoefteanalyse", design: "Ontwerp", build: "Ontwikkeling", test: "Testen en acceptatie", todo: "Te doen",
    doing: "Bezig", done: "Klaar", begin: "Beginnen", finish: "Afronden", places: "plaatst", contains: "bevat",
    share: "Marktaandeel", productA: "Product A", productB: "Product B", other: "Overig",
  },
  "pt-BR": {
    flowComment: "Fluxograma de exemplo: clique em “{edit}” abaixo para alterá-lo", sequenceComment: "Diagrama de sequência de exemplo",
    ganttComment: "Gráfico de Gantt de exemplo", stateComment: "Diagrama de estados de exemplo", erComment: "Diagrama ER de exemplo (relações entre entidades)",
    pieComment: "Gráfico de pizza de exemplo", edit: "Editar código-fonte", start: "Início", approved: "Aprovado?", yes: "Sim",
    no: "Não", next: "Próxima etapa", revise: "Devolver para ajustes", end: "Fim", user: "Usuário", system: "Sistema",
    request: "Enviar solicitação", result: "Retornar resultado", plan: "Plano do projeto", phase1: "Fase 1", phase2: "Fase 2",
    analysis: "Análise de requisitos", design: "Projeto", build: "Desenvolvimento", test: "Testes e aceitação", todo: "A fazer",
    doing: "Em andamento", done: "Concluído", begin: "Iniciar", finish: "Concluir", places: "faz", contains: "contém",
    share: "Participação de mercado", productA: "Produto A", productB: "Produto B", other: "Outros",
  },
  da: {
    flowComment: "Eksempel på rutediagram: klik på “{edit}” nedenfor for at ændre det", sequenceComment: "Eksempel på sekvensdiagram",
    ganttComment: "Eksempel på Gantt-diagram", stateComment: "Eksempel på tilstandsdiagram", erComment: "Eksempel på ER-diagram (enhedsrelationer)",
    pieComment: "Eksempel på cirkeldiagram", edit: "Rediger kilde", start: "Start", approved: "Godkendt?", yes: "Ja", no: "Nej",
    next: "Næste trin", revise: "Retur til rettelse", end: "Slut", user: "Bruger", system: "System", request: "Send anmodning",
    result: "Returnér resultat", plan: "Projektplan", phase1: "Fase 1", phase2: "Fase 2", analysis: "Kravanalyse",
    design: "Design", build: "Udvikling", test: "Test og godkendelse", todo: "Venter", doing: "I gang", done: "Færdig",
    begin: "Start", finish: "Afslut", places: "afgiver", contains: "indeholder", share: "Markedsandel", productA: "Produkt A",
    productB: "Produkt B", other: "Andet",
  },
  no: {
    flowComment: "Eksempel på flytdiagram: klikk på «{edit}» nedenfor for å endre det", sequenceComment: "Eksempel på sekvensdiagram",
    ganttComment: "Eksempel på Gantt-diagram", stateComment: "Eksempel på tilstandsdiagram", erComment: "Eksempel på ER-diagram (enhetsrelasjoner)",
    pieComment: "Eksempel på sektordiagram", edit: "Rediger kilde", start: "Start", approved: "Godkjent?", yes: "Ja", no: "Nei",
    next: "Neste trinn", revise: "Tilbake for retting", end: "Slutt", user: "Bruker", system: "System", request: "Send forespørsel",
    result: "Returner resultat", plan: "Prosjektplan", phase1: "Fase 1", phase2: "Fase 2", analysis: "Behovsanalyse",
    design: "Design", build: "Utvikling", test: "Test og godkjenning", todo: "Venter", doing: "Pågår", done: "Ferdig",
    begin: "Start", finish: "Fullfør", places: "legger inn", contains: "inneholder", share: "Markedsandel", productA: "Produkt A",
    productB: "Produkt B", other: "Annet",
  },
  sv: {
    flowComment: "Exempel på flödesschema: klicka på ”{edit}” nedan för att ändra det", sequenceComment: "Exempel på sekvensdiagram",
    ganttComment: "Exempel på Gantt-schema", stateComment: "Exempel på tillståndsdiagram", erComment: "Exempel på ER-diagram (entitetsrelationer)",
    pieComment: "Exempel på cirkeldiagram", edit: "Redigera källa", start: "Start", approved: "Godkänd?", yes: "Ja", no: "Nej",
    next: "Nästa steg", revise: "Tillbaka för ändring", end: "Slut", user: "Användare", system: "System", request: "Skicka begäran",
    result: "Returnera resultat", plan: "Projektplan", phase1: "Fas 1", phase2: "Fas 2", analysis: "Kravanalys", design: "Design",
    build: "Utveckling", test: "Test och godkännande", todo: "Att göra", doing: "Pågår", done: "Klar", begin: "Börja",
    finish: "Slutför", places: "lägger", contains: "innehåller", share: "Marknadsandel", productA: "Produkt A",
    productB: "Produkt B", other: "Övrigt",
  },
  fi: {
    flowComment: "Esimerkkivuokaavio: muokkaa sitä valitsemalla alta ”{edit}”", sequenceComment: "Esimerkkisekvenssikaavio",
    ganttComment: "Esimerkki-Gantt-kaavio", stateComment: "Esimerkkitilakaavio", erComment: "Esimerkki-ER-kaavio (kohteiden suhteet)",
    pieComment: "Esimerkkiympyräkaavio", edit: "Muokkaa lähdekoodia", start: "Alku", approved: "Hyväksytty?", yes: "Kyllä",
    no: "Ei", next: "Seuraava vaihe", revise: "Palautus korjattavaksi", end: "Loppu", user: "Käyttäjä", system: "Järjestelmä",
    request: "Lähetä pyyntö", result: "Palauta tulos", plan: "Projektisuunnitelma", phase1: "Vaihe 1", phase2: "Vaihe 2",
    analysis: "Vaatimusmäärittely", design: "Suunnittelu", build: "Toteutus", test: "Testaus ja hyväksyntä", todo: "Odottaa",
    doing: "Käynnissä", done: "Valmis", begin: "Aloita", finish: "Valmistu", places: "tekee", contains: "sisältää",
    share: "Markkinaosuus", productA: "Tuote A", productB: "Tuote B", other: "Muut",
  },
  id: {
    flowComment: "Contoh diagram alir: klik “{edit}” di bawah untuk mengubahnya", sequenceComment: "Contoh diagram urutan",
    ganttComment: "Contoh bagan Gantt", stateComment: "Contoh diagram status", erComment: "Contoh diagram ER (hubungan entitas)",
    pieComment: "Contoh diagram lingkaran", edit: "Edit sumber", start: "Mulai", approved: "Disetujui?", yes: "Ya", no: "Tidak",
    next: "Langkah berikutnya", revise: "Kembalikan untuk revisi", end: "Selesai", user: "Pengguna", system: "Sistem",
    request: "Kirim permintaan", result: "Kembalikan hasil", plan: "Rencana proyek", phase1: "Tahap 1", phase2: "Tahap 2",
    analysis: "Analisis kebutuhan", design: "Desain", build: "Pengembangan", test: "Pengujian dan penerimaan", todo: "Menunggu",
    doing: "Berjalan", done: "Selesai", begin: "Mulai", finish: "Selesaikan", places: "membuat", contains: "berisi",
    share: "Pangsa pasar", productA: "Produk A", productB: "Produk B", other: "Lainnya",
  },
  th: {
    flowComment: "ตัวอย่างโฟลว์ชาร์ต: คลิก “{edit}” ด้านล่างเพื่อแก้ไข", sequenceComment: "ตัวอย่างไดอะแกรมลำดับ",
    ganttComment: "ตัวอย่างแผนภูมิแกนต์", stateComment: "ตัวอย่างไดอะแกรมสถานะ", erComment: "ตัวอย่างไดอะแกรม ER (ความสัมพันธ์ของเอนทิตี)",
    pieComment: "ตัวอย่างแผนภูมิวงกลม", edit: "แก้ไขซอร์ส", start: "เริ่ม", approved: "อนุมัติ?", yes: "ใช่", no: "ไม่",
    next: "ขั้นตอนถัดไป", revise: "ส่งกลับแก้ไข", end: "สิ้นสุด", user: "ผู้ใช้", system: "ระบบ", request: "ส่งคำขอ",
    result: "ส่งผลลัพธ์กลับ", plan: "แผนโครงการ", phase1: "ระยะที่ 1", phase2: "ระยะที่ 2", analysis: "วิเคราะห์ความต้องการ",
    design: "ออกแบบ", build: "พัฒนา", test: "ทดสอบและตรวจรับ", todo: "รอดำเนินการ", doing: "กำลังดำเนินการ",
    done: "เสร็จแล้ว", begin: "เริ่ม", finish: "เสร็จสิ้น", places: "สั่งซื้อ", contains: "ประกอบด้วย", share: "ส่วนแบ่งตลาด",
    productA: "ผลิตภัณฑ์ A", productB: "ผลิตภัณฑ์ B", other: "อื่นๆ",
  },
  vi: {
    flowComment: "Lưu đồ mẫu: bấm “{edit}” bên dưới để sửa", sequenceComment: "Sơ đồ tuần tự mẫu", ganttComment: "Biểu đồ Gantt mẫu",
    stateComment: "Sơ đồ trạng thái mẫu", erComment: "Sơ đồ ER mẫu (quan hệ thực thể)", pieComment: "Biểu đồ tròn mẫu",
    edit: "Sửa mã nguồn", start: "Bắt đầu", approved: "Được duyệt?", yes: "Có", no: "Không", next: "Bước tiếp theo",
    revise: "Trả lại để sửa", end: "Kết thúc", user: "Người dùng", system: "Hệ thống", request: "Gửi yêu cầu",
    result: "Trả kết quả", plan: "Kế hoạch dự án", phase1: "Giai đoạn 1", phase2: "Giai đoạn 2", analysis: "Phân tích yêu cầu",
    design: "Thiết kế", build: "Phát triển", test: "Kiểm thử và nghiệm thu", todo: "Chờ xử lý", doing: "Đang làm",
    done: "Hoàn thành", begin: "Bắt đầu", finish: "Hoàn tất", places: "đặt", contains: "gồm", share: "Thị phần",
    productA: "Sản phẩm A", productB: "Sản phẩm B", other: "Khác",
  },
};

const CODE_CHART_WORDS: Translated<CodeChartWords> = {
  en: {
    barIntro: ["Bar chart example: click “{run}” to run it in the sandbox. Leave the", "figure open at the end and the runner embeds it in the document as a PNG."],
    run: "Run", noClose: "Do not call plt.close(): only an open figure is captured",
    line: "Line chart example: trends of several series", scatter: "Scatter plot example: correlation of two variables",
    seed: "fixed random seed, so the result is reproducible", pie: "Pie chart example: share of each part",
    captured: "The open figure is captured as a PNG automatically",
  },
  "zh-TW": {
    barIntro: ["直條圖範例：按一下「{run}」在沙箱中執行，指令碼結束時保持", "figure 開啟，執行器會自動把它擷取為 PNG 內嵌到文件。"],
    run: "執行", noClose: "不要呼叫 plt.close()：開啟的 figure 才會被擷取", line: "折線圖範例：多數列趨勢比較",
    scatter: "散佈圖範例：兩個變數的相關性", seed: "固定亂數種子，確保結果可重現", pie: "圓形圖範例：比例分布",
    captured: "開啟的 figure 會被自動擷取為 PNG",
  },
  ja: {
    barIntro: ["棒グラフの例: 「{run}」をクリックするとサンドボックスで実行します。スクリプトの", "終わりに figure を開いたままにすると、PNG として文書に埋め込まれます。"],
    run: "実行", noClose: "plt.close() は呼ばないでください: 開いている figure だけが取り込まれます",
    line: "折れ線グラフの例: 複数系列の傾向の比較", scatter: "散布図の例: 2 つの変数の相関", seed: "乱数のシードを固定して再現できるようにする",
    pie: "円グラフの例: 構成比", captured: "開いている figure は自動的に PNG として取り込まれます",
  },
  ko: {
    barIntro: ["막대형 차트 예제: '{run}'을 클릭하면 샌드박스에서 실행됩니다. 스크립트가 끝날 때", "figure를 열어 두면 실행기가 PNG로 캡처해 문서에 넣습니다."],
    run: "실행", noClose: "plt.close()를 호출하지 마세요: 열려 있는 figure만 캡처됩니다", line: "꺾은선형 차트 예제: 여러 계열의 추세 비교",
    scatter: "분산형 차트 예제: 두 변수의 상관관계", seed: "결과를 재현할 수 있도록 난수 시드 고정", pie: "원형 차트 예제: 구성 비율",
    captured: "열려 있는 figure는 자동으로 PNG로 캡처됩니다",
  },
  de: {
    barIntro: ["Säulendiagramm-Beispiel: Mit „{run}“ in der Sandbox ausführen. Bleibt die figure", "am Ende geöffnet, bettet der Runner sie als PNG in das Dokument ein."],
    run: "Ausführen", noClose: "plt.close() nicht aufrufen: nur eine geöffnete figure wird erfasst",
    line: "Liniendiagramm-Beispiel: Trends mehrerer Reihen", scatter: "Punktdiagramm-Beispiel: Zusammenhang zweier Variablen",
    seed: "fester Zufallsstartwert, damit das Ergebnis reproduzierbar ist", pie: "Kreisdiagramm-Beispiel: Anteile",
    captured: "Die geöffnete figure wird automatisch als PNG erfasst",
  },
  fr: {
    barIntro: ["Exemple d’histogramme : cliquez sur « {run} » pour l’exécuter dans le bac à sable. Laissez la", "figure ouverte à la fin : l’exécuteur l’intègre au document en PNG."],
    run: "Exécuter", noClose: "N’appelez pas plt.close() : seule une figure ouverte est capturée",
    line: "Exemple de graphique en courbes : tendances de plusieurs séries", scatter: "Exemple de nuage de points : corrélation de deux variables",
    seed: "graine aléatoire fixe pour un résultat reproductible", pie: "Exemple de graphique en secteurs : répartition",
    captured: "La figure ouverte est capturée automatiquement en PNG",
  },
  es: {
    barIntro: ["Ejemplo de gráfico de columnas: haga clic en «{run}» para ejecutarlo en el espacio aislado. Deje la", "figure abierta al final y el ejecutor la insertará en el documento como PNG."],
    run: "Ejecutar", noClose: "No llame a plt.close(): solo se captura una figure abierta",
    line: "Ejemplo de gráfico de líneas: tendencias de varias series", scatter: "Ejemplo de gráfico de dispersión: correlación de dos variables",
    seed: "semilla aleatoria fija para que el resultado sea reproducible", pie: "Ejemplo de gráfico circular: proporciones",
    captured: "La figure abierta se captura automáticamente como PNG",
  },
  it: {
    barIntro: ["Esempio di istogramma: fai clic su «{run}» per eseguirlo nella sandbox. Lascia la", "figure aperta alla fine e l'esecutore la incorpora nel documento come PNG."],
    run: "Esegui", noClose: "Non chiamare plt.close(): viene acquisita solo una figure aperta",
    line: "Esempio di grafico a linee: andamento di più serie", scatter: "Esempio di grafico a dispersione: correlazione tra due variabili",
    seed: "seme casuale fisso, per un risultato riproducibile", pie: "Esempio di grafico a torta: ripartizione",
    captured: "La figure aperta viene acquisita automaticamente come PNG",
  },
  nl: {
    barIntro: ["Voorbeeld kolomdiagram: klik op ‘{run}’ om het in de sandbox uit te voeren. Laat de", "figure aan het eind open; de uitvoerder voegt hem als PNG in het document in."],
    run: "Uitvoeren", noClose: "Roep plt.close() niet aan: alleen een open figure wordt vastgelegd",
    line: "Voorbeeld lijndiagram: trends van meerdere reeksen", scatter: "Voorbeeld spreidingsdiagram: verband tussen twee variabelen",
    seed: "vaste willekeurige seed, zodat het resultaat reproduceerbaar is", pie: "Voorbeeld cirkeldiagram: verdeling",
    captured: "De open figure wordt automatisch als PNG vastgelegd",
  },
  "pt-BR": {
    barIntro: ["Exemplo de gráfico de colunas: clique em “{run}” para executá-lo na sandbox. Deixe a", "figure aberta no final e o executor a insere no documento como PNG."],
    run: "Executar", noClose: "Não chame plt.close(): só uma figure aberta é capturada",
    line: "Exemplo de gráfico de linhas: tendências de várias séries", scatter: "Exemplo de gráfico de dispersão: correlação entre duas variáveis",
    seed: "semente aleatória fixa, para um resultado reproduzível", pie: "Exemplo de gráfico de pizza: proporções",
    captured: "A figure aberta é capturada automaticamente como PNG",
  },
  da: {
    barIntro: ["Eksempel på søjlediagram: klik på “{run}” for at køre det i sandkassen. Lad", "figure være åben til sidst, så indsætter kørslen den i dokumentet som PNG."],
    run: "Kør", noClose: "Kald ikke plt.close(): kun en åben figure bliver indfanget",
    line: "Eksempel på kurvediagram: tendenser for flere serier", scatter: "Eksempel på punktdiagram: sammenhæng mellem to variabler",
    seed: "fast tilfældigt seed, så resultatet kan genskabes", pie: "Eksempel på cirkeldiagram: fordeling",
    captured: "Den åbne figure indfanges automatisk som PNG",
  },
  no: {
    barIntro: ["Eksempel på stolpediagram: klikk på «{run}» for å kjøre det i sandkassen. La", "figure stå åpen til slutt, så setter kjøringen den inn i dokumentet som PNG."],
    run: "Kjør", noClose: "Ikke kall plt.close(): bare en åpen figure blir fanget",
    line: "Eksempel på linjediagram: trender for flere serier", scatter: "Eksempel på punktdiagram: sammenheng mellom to variabler",
    seed: "fast tilfeldig frø, så resultatet kan gjenskapes", pie: "Eksempel på sektordiagram: fordeling",
    captured: "Den åpne figure fanges automatisk som PNG",
  },
  sv: {
    barIntro: ["Exempel på stapeldiagram: klicka på ”{run}” för att köra det i sandlådan. Låt", "figure vara öppen i slutet så bäddar körningen in den i dokumentet som PNG."],
    run: "Kör", noClose: "Anropa inte plt.close(): bara en öppen figure fångas",
    line: "Exempel på linjediagram: trender för flera serier", scatter: "Exempel på punktdiagram: samband mellan två variabler",
    seed: "fast slumpfrö så att resultatet går att återskapa", pie: "Exempel på cirkeldiagram: fördelning",
    captured: "Den öppna figure fångas automatiskt som PNG",
  },
  fi: {
    barIntro: ["Pylväskaavioesimerkki: suorita se eristetyssä ympäristössä valitsemalla ”{run}”. Jätä", "figure auki lopussa, niin suorittaja upottaa sen asiakirjaan PNG-kuvana."],
    run: "Suorita", noClose: "Älä kutsu plt.close()-funktiota: vain avoin figure tallennetaan",
    line: "Viivakaavioesimerkki: useiden sarjojen trendit", scatter: "Hajontakaavioesimerkki: kahden muuttujan korrelaatio",
    seed: "kiinteä satunnaisluvun siemen, jotta tulos on toistettavissa", pie: "Ympyräkaavioesimerkki: osuudet",
    captured: "Avoin figure tallennetaan automaattisesti PNG-kuvana",
  },
  id: {
    barIntro: ["Contoh bagan kolom: klik “{run}” untuk menjalankannya di sandbox. Biarkan", "figure tetap terbuka di akhir, lalu runner menyisipkannya ke dokumen sebagai PNG."],
    run: "Jalankan", noClose: "Jangan panggil plt.close(): hanya figure yang terbuka yang ditangkap",
    line: "Contoh bagan garis: tren beberapa seri", scatter: "Contoh diagram sebar: korelasi dua variabel",
    seed: "seed acak tetap agar hasilnya dapat diulang", pie: "Contoh diagram lingkaran: proporsi",
    captured: "Figure yang terbuka ditangkap otomatis sebagai PNG",
  },
  th: {
    barIntro: ["ตัวอย่างแผนภูมิคอลัมน์: คลิก “{run}” เพื่อเรียกใช้ในแซนด์บ็อกซ์ เปิด", "figure ค้างไว้ตอนจบสคริปต์ แล้วตัวเรียกใช้จะฝังเป็น PNG ในเอกสาร"],
    run: "เรียกใช้", noClose: "อย่าเรียก plt.close(): จะจับภาพเฉพาะ figure ที่เปิดอยู่",
    line: "ตัวอย่างแผนภูมิเส้น: แนวโน้มของหลายชุดข้อมูล", scatter: "ตัวอย่างแผนภูมิกระจาย: ความสัมพันธ์ของสองตัวแปร",
    seed: "กำหนดซีดสุ่มคงที่เพื่อให้ผลลัพธ์ทำซ้ำได้", pie: "ตัวอย่างแผนภูมิวงกลม: สัดส่วน",
    captured: "figure ที่เปิดอยู่จะถูกจับภาพเป็น PNG โดยอัตโนมัติ",
  },
  vi: {
    barIntro: ["Ví dụ biểu đồ cột: bấm “{run}” để chạy trong hộp cát. Để", "figure mở khi kết thúc, trình chạy sẽ chèn nó vào tài liệu dưới dạng PNG."],
    run: "Chạy", noClose: "Đừng gọi plt.close(): chỉ figure đang mở mới được chụp",
    line: "Ví dụ biểu đồ đường: xu hướng của nhiều chuỗi", scatter: "Ví dụ biểu đồ phân tán: tương quan giữa hai biến",
    seed: "cố định hạt giống ngẫu nhiên để kết quả lặp lại được", pie: "Ví dụ biểu đồ tròn: tỷ trọng",
    captured: "Figure đang mở được tự động chụp thành PNG",
  },
};

/** A word Mermaid takes as a bare id (a participant, a state): one token. */
function mermaidBareId(word: string): boolean {
  return /^[\p{L}\p{M}\p{N}_]+$/u.test(word);
}

/** Each word's id (itself when bare, `prefix<n>` otherwise) and the lines that
 * declare the non-bare ones with their label. */
function mermaidIds(
  words: readonly string[],
  prefix: string,
  declare: (id: string, word: string) => string,
): { ids: string[]; declarations: string[] } {
  const declarations: string[] = [];
  const ids = words.map((word, index) => {
    if (mermaidBareId(word)) return word;
    const id = `${prefix}${index + 1}`;
    declarations.push(declare(id, word));
    return id;
  });
  return { ids, declarations };
}

function mermaidSources(w: MermaidWords): Record<MermaidTemplateId, string> {
  const people = mermaidIds([w.user, w.system], "P", (id, word) => `    participant ${id} as ${word}`);
  const [user, system] = people.ids;
  const peopleLines = people.declarations.length
    ? people.declarations
    : people.ids.map((id) => `    participant ${id}`);
  const states = mermaidIds([w.todo, w.doing, w.done], "S", (id, word) => `    state "${word}" as ${id}`);
  const [todo, doing, done] = states.ids;
  return {
    flowchart: [
      "flowchart TD",
      `    %% ${w.flowComment.replace("{edit}", w.edit)}`,
      `    A[${w.start}] --> B{${w.approved}}`,
      `    B -- ${w.yes} --> C[${w.next}]`,
      `    B -- ${w.no} --> D[${w.revise}]`,
      `    C --> E[${w.end}]`,
      "    D --> B",
    ].join("\n"),
    sequence: [
      "sequenceDiagram",
      `    %% ${w.sequenceComment}`,
      ...peopleLines,
      `    ${user}->>${system}: ${w.request}`,
      `    ${system}-->>${user}: ${w.result}`,
    ].join("\n"),
    gantt: [
      "gantt",
      `    %% ${w.ganttComment}`,
      `    title ${w.plan}`,
      "    dateFormat YYYY-MM-DD",
      `    section ${w.phase1}`,
      `    ${w.analysis} :a1, 2026-07-01, 7d`,
      `    ${w.design} :after a1, 5d`,
      `    section ${w.phase2}`,
      `    ${w.build} :2026-07-13, 10d`,
      `    ${w.test} :3d`,
    ].join("\n"),
    state: [
      "stateDiagram-v2",
      `    %% ${w.stateComment}`,
      ...states.declarations,
      `    [*] --> ${todo}`,
      `    ${todo} --> ${doing}: ${w.begin}`,
      `    ${doing} --> ${done}: ${w.finish}`,
      `    ${done} --> [*]`,
    ].join("\n"),
    er: [
      "erDiagram",
      `    %% ${w.erComment}`,
      `    CUSTOMER ||--o{ ORDER : "${w.places}"`,
      `    ORDER ||--|{ ORDER_ITEM : "${w.contains}"`,
      "    CUSTOMER {",
      "        string name",
      "        string phone",
      "    }",
    ].join("\n"),
    pie: [
      "pie",
      `    %% ${w.pieComment}`,
      `    title ${w.share}`,
      `    "${w.productA}" : 45`,
      `    "${w.productB}" : 30`,
      `    "${w.other}" : 25`,
    ].join("\n"),
  };
}

/**
 * The Mermaid sources in `locale`'s words, or null for Chinese (the blocks'
 * own literal sources, which the caller keeps).
 */
export function translatedMermaidSources(
  locale: string | null | undefined,
): Record<MermaidTemplateId, string> | null {
  const language = contentLocaleOf(locale, "zh");
  return language === "zh" ? null : mermaidSources(MERMAID_WORDS[language]);
}

function codeChartSources(w: CodeChartWords): Record<CodeChartTemplateId, string> {
  const [introA, introB] = w.barIntro;
  return {
    bar: `# ${introA.replace("{run}", w.run)}
# ${introB}
import matplotlib.pyplot as plt

x = ["Q1", "Q2", "Q3", "Q4"]
y = [120, 150, 90, 180]

fig, ax = plt.subplots(figsize=(6, 4))
ax.bar(x, y, color="#2563eb")
ax.set_title("Quarterly Sales")
ax.set_ylabel("Amount")
# ${w.noClose}`,
    line: `# ${w.line}
import matplotlib.pyplot as plt

x = [2021, 2022, 2023, 2024, 2025]
a = [3.2, 4.1, 4.8, 6.0, 7.4]
b = [2.5, 2.9, 3.6, 4.2, 5.1]

fig, ax = plt.subplots(figsize=(6, 4))
ax.plot(x, a, marker="o", label="Series A")
ax.plot(x, b, marker="s", label="Series B")
ax.set_title("Yearly Trend")
ax.legend()
ax.grid(True, alpha=0.3)
# ${w.captured}`,
    scatter: `# ${w.scatter}
import matplotlib.pyplot as plt
import random

random.seed(7)  # ${w.seed}
x = [random.gauss(50, 12) for _ in range(80)]
y = [v * 0.8 + random.gauss(10, 6) for v in x]

fig, ax = plt.subplots(figsize=(6, 4))
ax.scatter(x, y, alpha=0.6, color="var(--console-success, #059669)")
ax.set_title("Correlation")
ax.set_xlabel("X")
ax.set_ylabel("Y")
# ${w.captured}`,
    pie: `# ${w.pie}
import matplotlib.pyplot as plt

labels = ["A", "B", "C", "Other"]
sizes = [45, 30, 15, 10]

fig, ax = plt.subplots(figsize=(5, 5))
ax.pie(sizes, labels=labels, autopct="%1.0f%%", startangle=90)
ax.set_title("Share")
# ${w.captured}`,
  };
}

/**
 * The code chart sources with comments in `locale`'s words, or null for
 * Chinese (the blocks' own literal sources, which the caller keeps).
 */
export function translatedCodeChartSources(
  locale: string | null | undefined,
): Record<CodeChartTemplateId, string> | null {
  const language = contentLocaleOf(locale, "zh");
  return language === "zh" ? null : codeChartSources(CODE_CHART_WORDS[language]);
}
