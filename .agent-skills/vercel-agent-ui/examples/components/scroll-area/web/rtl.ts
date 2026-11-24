import "@ui-sdk/web/scroll-area"

const tags = Array.from({ length: 40 }, (_, index) => `وسم ${index + 1}`)

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div dir="rtl">
      <ui-scroll-area>
        <ui-scroll-area-viewport>
          <ui-scroll-area-content>
            <h4>الوسوم</h4>
            ${tags.map((tag) => `<div>${tag}</div>`).join("")}
          </ui-scroll-area-content>
        </ui-scroll-area-viewport>
        <ui-scroll-area-scrollbar>
          <ui-scroll-area-thumb></ui-scroll-area-thumb>
        </ui-scroll-area-scrollbar>
      </ui-scroll-area>
    </div>
  `
}

export { mount }
