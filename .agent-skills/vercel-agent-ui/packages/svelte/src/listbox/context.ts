const GroupKey = Symbol("listbox-group")
const ItemKey = Symbol("listbox-item")

type ItemContext = () => { key: string }

export { GroupKey, type ItemContext, ItemKey }
