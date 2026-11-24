import "@ui-sdk/web/field"
import "@ui-sdk/web/textarea"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-field dir="rtl" name="feedback">
      <ui-field-label>ملاحظاتك</ui-field-label>
      <ui-textarea auto-resize>
        <textarea placeholder="أخبرنا برأيك…"></textarea>
      </ui-textarea>
      <ui-field-description>نقرأ كل رسالة.</ui-field-description>
    </ui-field>
  `
}

export { mount }
