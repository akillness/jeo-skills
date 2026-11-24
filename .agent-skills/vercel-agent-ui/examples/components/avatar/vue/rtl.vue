<script setup lang="ts">
import { Avatar, AvatarFallback, AvatarImage } from "@ui-sdk/vue/avatar"

const team = [
  {
    name: "آدا لوفليس",
    initials: "آ ل",
    src: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAACqklEQVR42u2Yu2tUQRSH7z+itShYCBYRMRaSFIKPIj4qMQppVhexEVIYVHwEExGCWUHYCCEhUVZB4osEERITsDFLwJBoYZcqRCzsxA8GhiXujffOmdwzCwO/YnfnnDO/b+7c2ZlJPqz+aWklESACRIAIEAEiQATYpPH3S9dvDPacv3DuVBfiA1/5sQUAHjyePH64rX33jqaiiYBAARjg00c706w3ijCPTyPx5b5z/54s7o0I9sWQFO/eL4MU4M2XDQf3loF0ZYBy6YqbeyPSNQGqLz5J3BtRRA1AOPxeHkIimf3WRNehvbMjt3KJFJsueRPcAYZH31oHGPo5P5ZLpNh0SikAsDsw3ZdOtud1b0SiqUApBQA2Oab72v2rbgAkmgqU0gRwc2+kD+A8fxpnkSbAQPmsBIB0NQB2+fRdudYtASCdIpRSW4W8AOisQuwlfQFItqWirQQnLPk7QBG1vRCPXr4KSeaPFMAcBiQA8iOB9DxwZ/DJu0e9bu5JJF3/SDl077YbAIlBnImZA98+1vK6J0V+nvR2KzG3/Gt94Xl29wSTEta9UH3pe3YAgkO8mcvI4NG9/6vFha/ra59fp1mniYDQL3eXF+tpADS1wO10BIgAESACaAE8m9+4Wa2/nJhKA6CJAMLCAng6s3axb2bfscrOA/3obl8lDYAmE0MwKSQqAzCcB8+MGE9Wl8pD06PVpqJpUzDpFFEAGH71ww65XJSiYEEAU4u/T5Rqvqw3irIU314AZq3HgW/6KPK+GEku97uOPNw+90Z0kYshCcq9A0OScYEvzL1lyPh3kQng37WyANGpH4DL/bPFuzeiaylA8ZMn70T6DwB/+FrujTAgAlAcfvsQ3AEGJlZ03RthwxFAff5kmUVbAXR0j4cAgA1HgBDcG21h8i9D6D5a5WfrvgAAAABJRU5ErkJggg==",
  },
  {
    name: "كاثرين جونسون",
    initials: "ك ج",
    src: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAACqklEQVR42u2YwUtUURSH39/QJgqJZtGkQmGlILkwBhljqHBRUEEkGkIxgsHsXCS6E4UWtig3UiAE2iIXkSs3s3MR1CIRXElEG2nVKuiLG89B59l791zfuQMXfgudd855v+++8+6790a/v822tKIAEAACQAAIAAEgABzQ543a3NTQyL2+2ze6EX/wLz+2AMDblw97r5xrO3WyqbhEgKcADHC5/0KS9UYR5vBpRK7cdxbPpHFvRLArhih/924ZpAB7WzMW7mMG0pUBJsZKdu6NSNcEqK+NS9wbUUQNQDj8Th5CJOn+/W4utD2tXM4kUuJ0yZtgD/BheSx2gKH5+32ZREqcTikFAFYH/76vHWezujci0VSglAIAixxz+9HSRTsAEk0FSmkC2Lk30gew7p/GLtIEuNlzXgJAuhoAq/y/977aIQEgnSKUUpuFnADozEKsJV0BSJaloqUEOyz5O0ARtbUQj14+C0n6RwpgNgMSAPmWQLofWJy7+6TcZeeeRNL1t5TPHg/YAZDoxZ6YHlicuJ7VPSny/aSzU4m9L1MLo9fSuyeYFM/Ohd5X0wMQ7OPJXEoGh+7dHy1+35x8XaskWecSAb4f7taXRpIAuNQCp9MBIAAEgACgBfDz0+TXNw9WaolrOy4RQJhfAD/qtfp0eblSeNV9Ai0MFhOXQINFE0MwKSQqAzCcq3fajadYL0qF50OXmopLB4JJp4gCwO56NR5yuShFwZwAfm1Pf6z2urLeKMpS/HgB6FqHA9/0UWR9MaJM7pf6Tx+feyNukYkh8sq9BUOUcoLPzX3MkPJzkQrg8FyZg7ipG4DN+Vv5uzfi1lKA/JsnayP9B4APvpZ7IwyIABSHP34I9gA77x7pujfChiWAev+k6aKjANaGu3wAwIYlgA/ujY4w+QdlmgOMzzUtTQAAAABJRU5ErkJggg==",
  },
  {
    name: "آلان تورينج",
    initials: "آ ت",
    src: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAACqElEQVR42u2Yz0tVQRTH765/IIJ27qVdLdrUTqJFUDsJIoIHldUiiN4mCzGMqMAEEanErIdaSHJF+iGlaJGgEG8RgkFthCDQZds+MDE87F27d854zzwY+C7ee3POme9n7tx5M5O8+/2lpZVEgAgQASJABIgAEWCbZtcnp15emujvGO87jPjAV35sAYDpD7efXWsbPbenqWgiIFAABrjWfSDLeqMI8/g0El/ux7r25nFvRLAvhqR8934ZpABvNhcd3FsG0pUBXgyfcnNvRLomwEz9icS9EUXUAITD7+UhJJLZb01MXt7/9enVQiLFpkveBHeA9HO/dYChn68HC4kUm04pBQB2B3+7r7YXdW9EoqlAKQUANjmm+9Whs24AJJoKlNIEcHNvpA/gPH8aZ5EmwPydDgkA6WoA7PLpe+n+CQkA6RShlNoq5AVAZxViL+kLQLItFW0lOGHJ3wGKqO2FePTyVUgyf6QA5jAgAZAfCaTngVez1frjC27uSSQ9gDNx7aIbAIlBnImZA+vvh4q6J0V+nvR2K7GwtbwxN5zfPcGkhHUvtPL9bX4AgkO8mcvJ4NG9/6vFxV8ffyyNZlmniYDQL3fra2nmurmWtsDtdASIABEgAmgB1DbmbswPjqf3sgBoIoCwsAAefUvPPK+2Xz+2r3IQ3XxQyQKgycQQTAqJygAM56FbJ40nq0pv58xYd1PRtC2YdIooADysT9ghl4tSFCwJYHrz0/GBii/rjaIsxXcXgFnrceCbPoqiL0ZSyH3blSO7596ILgoxJEG5d2BIci7wpbm3DDn/LnIB/LtWliA69QNwfqqnfPdGdC0FKH/yFJ1I/wHgD1/LvREGRACKw28fgjtA3/KIrnsjbDgCqM+fPLNoJ4Cjd0+HAIANR4AQ3BvtYPIP6eT82uvB/KAAAAAASUVORK5CYII=",
  },
]
</script>

<template>
  <div data-slot="row" dir="rtl">
    <Avatar v-for="person in team" :key="person.name">
      <AvatarImage :src="person.src" :alt="person.name" />
      <AvatarFallback>
        {{ person.initials }}
      </AvatarFallback>
    </Avatar>
    <span data-slot="media"> +٣ </span>
  </div>
</template>
