import "@ui-sdk/web/field"
import "@ui-sdk/web/input"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-field-set>
      <fieldset dir="rtl">
        <legend>العنوان</legend>
        <ui-field-description>نحتاج عنوانك لتوصيل طلبك.</ui-field-description>
        <ui-field name="street">
          <ui-field-label>الشارع</ui-field-label>
          <ui-input><input /></ui-input>
        </ui-field>
        <ui-field name="city">
          <ui-field-label>المدينة</ui-field-label>
          <ui-input><input /></ui-input>
        </ui-field>
      </fieldset>
    </ui-field-set>
  `
}

export { mount }
