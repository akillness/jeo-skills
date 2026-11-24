import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@ui-sdk/react/field"
import { Input } from "@ui-sdk/react/input"

function Example() {
  return (
    <FieldSet>
      <FieldLegend>Address</FieldLegend>
      <FieldDescription>
        We need your address to deliver your order.
      </FieldDescription>
      <FieldGroup>
        <Field name="street">
          <FieldLabel>Street address</FieldLabel>
          <Input autoComplete="street-address" />
        </Field>
        <div data-slot="grid">
          <Field name="city">
            <FieldLabel>City</FieldLabel>
            <Input autoComplete="address-level2" />
          </Field>
          <Field name="postal-code">
            <FieldLabel>Postal code</FieldLabel>
            <Input autoComplete="postal-code" />
          </Field>
        </div>
      </FieldGroup>
    </FieldSet>
  )
}

export { Example }
