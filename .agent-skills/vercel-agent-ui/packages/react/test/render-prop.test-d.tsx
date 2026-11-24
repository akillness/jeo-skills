import type * as React from "react"
import { Button } from "../src/button"

// An element held in a variable or passed through a prop has unknown props.
declare const link: React.ReactElement
;<Button render={link} />
;<Button render={<a href="/home" />} />
