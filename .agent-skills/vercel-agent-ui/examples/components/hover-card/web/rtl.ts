import "@ui-sdk/web/hover-card"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div dir="rtl">
      <ui-hover-card>
        <ui-hover-card-trigger><a href="https://example.com/people/hollis">هوليس غرانت</a></ui-hover-card-trigger>
        <ui-hover-card-content hidden align="start" side-offset="10">
          <ui-hover-card-arrow></ui-hover-card-arrow>
          <p>هوليس غرانت</p>
          <p>مهندس تصميم في فريق المدفوعات.</p>
        </ui-hover-card-content>
      </ui-hover-card>
    </div>
  `
}

export { mount }
