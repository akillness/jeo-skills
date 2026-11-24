<script setup lang="ts">
import { CheckIcon, ChevronRightIcon } from "@lucide/vue"
import {
  Menu,
  MenuCheckboxItem,
  MenuContent,
  MenuGroupLabel,
  MenuItem,
  MenuItemIndicator,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuSub,
  MenuSubContent,
  MenuSubTrigger,
  MenuTrigger,
} from "@ui-sdk/vue/menu"
import { Menubar } from "@ui-sdk/vue/menubar"
import { useLog } from "../../../shared/vue/log"

const recent = ["Q3 roadmap", "Launch checklist", "Offsite notes"]
const formats = ["PDF", "Markdown", "HTML"]
const appearances = ["Light", "Dark", "System"]

const log = useLog()
const chose = (value: string) => log(`Chose ${value}`)
</script>

<template>
  <Menubar>
    <Menu @action="chose">
      <MenuTrigger>File</MenuTrigger>
      <MenuContent>
        <MenuItem value="New document" shortcut="mod+n">New Document</MenuItem>
        <MenuItem value="Open" shortcut="mod+o">Open…</MenuItem>
        <MenuSub>
          <MenuSubTrigger>
            Open Recent
            <ChevronRightIcon aria-hidden="true" />
          </MenuSubTrigger>
          <MenuSubContent>
            <MenuItem v-for="name in recent" :key="name" :value="name">{{
              name
            }}</MenuItem>
          </MenuSubContent>
        </MenuSub>
        <MenuSeparator />
        <MenuSub>
          <MenuSubTrigger>
            Export
            <ChevronRightIcon aria-hidden="true" />
          </MenuSubTrigger>
          <MenuSubContent>
            <MenuItem
              v-for="format in formats"
              :key="format"
              :value="`Export as ${format}`"
            >
              {{ format }}
            </MenuItem>
          </MenuSubContent>
        </MenuSub>
        <MenuItem value="Print" shortcut="mod+p">Print…</MenuItem>
      </MenuContent>
    </Menu>
    <Menu @action="chose">
      <MenuTrigger>Edit</MenuTrigger>
      <MenuContent>
        <MenuItem value="Undo" shortcut="mod+z" disabled>Undo</MenuItem>
        <MenuItem value="Redo" shortcut="mod+shift+z">Redo</MenuItem>
        <MenuSeparator />
        <MenuItem value="Cut" shortcut="mod+x">Cut</MenuItem>
        <MenuItem value="Copy" shortcut="mod+c">Copy</MenuItem>
        <MenuItem value="Paste" shortcut="mod+v">Paste</MenuItem>
        <MenuSeparator />
        <MenuItem value="Find" shortcut="mod+f">Find…</MenuItem>
      </MenuContent>
    </Menu>
    <Menu
      @checked-change="
        (checked, details) => log(`${details.value} ${checked ? 'on' : 'off'}`)
      "
      @value-change="(value) => log(`${value} appearance`)"
    >
      <MenuTrigger>View</MenuTrigger>
      <MenuContent>
        <MenuCheckboxItem value="Ruler">
          <MenuItemIndicator>
            <CheckIcon aria-hidden="true" />
          </MenuItemIndicator>
          Show Ruler
        </MenuCheckboxItem>
        <MenuCheckboxItem value="Word count" default-checked>
          <MenuItemIndicator>
            <CheckIcon aria-hidden="true" />
          </MenuItemIndicator>
          Show Word Count
        </MenuCheckboxItem>
        <MenuSeparator />
        <MenuRadioGroup default-value="System">
          <MenuGroupLabel>Appearance</MenuGroupLabel>
          <MenuRadioItem
            v-for="appearance in appearances"
            :key="appearance"
            :value="appearance"
          >
            <MenuItemIndicator />
            {{ appearance }}
          </MenuRadioItem>
        </MenuRadioGroup>
      </MenuContent>
    </Menu>
  </Menubar>
</template>
