import "@ui-sdk/web/field"
import "@ui-sdk/web/input"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-field-set>
      <fieldset>
        <legend>Address</legend>
        <ui-field-description>We need your address to deliver your order.</ui-field-description>
        <ui-field-group>
          <ui-field name="street">
            <ui-field-label>Street address</ui-field-label>
            <ui-input><input autocomplete="street-address" /></ui-input>
          </ui-field>
          <div data-slot="grid">
            <ui-field name="city">
              <ui-field-label>City</ui-field-label>
              <ui-input><input autocomplete="address-level2" /></ui-input>
            </ui-field>
            <ui-field name="postal-code">
              <ui-field-label>Postal code</ui-field-label>
              <ui-input><input autocomplete="postal-code" /></ui-input>
            </ui-field>
          </div>
        </ui-field-group>
      </fieldset>
    </ui-field-set>
  `
}

export { mount }
