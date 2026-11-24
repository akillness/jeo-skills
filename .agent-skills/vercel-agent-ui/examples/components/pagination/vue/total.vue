<script setup lang="ts">
import { ChevronLeftIcon, ChevronRightIcon, EllipsisIcon } from "@lucide/vue"
import {
  Pagination,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationList,
  PaginationNext,
  PaginationPrevious,
} from "@ui-sdk/vue/pagination"
import { ref } from "vue"
import { useLog } from "../../../shared/vue/log"

const log = useLog()
const page = ref(2)
const pageSize = ref(20)
const total = 95

function onPageSizeChange(event: Event) {
  const { value } = event.target as HTMLSelectElement
  pageSize.value = Number(value)
  page.value = 1
  log(`${value} rows per page`)
}
</script>

<template>
  <div data-slot="stack">
    <div data-slot="row">
      <p>
        Showing {{ (page - 1) * pageSize + 1 }}–{{
          Math.min(page * pageSize, total)
        }}
        of {{ total }}
      </p>
      <label data-slot="label">
        Rows per page
        <select :value="pageSize" @change="onPageSizeChange">
          <option :value="10">10</option>
          <option :value="20">20</option>
          <option :value="50">50</option>
        </select>
      </label>
    </div>
    <Pagination
      v-model:page="page"
      aria-label="Pagination"
      :total="total"
      :page-size="pageSize"
      @page-change="(next) => log(`Page ${next}`)"
    >
      <PaginationList v-slot="{ state }">
        <PaginationItem>
          <PaginationPrevious data-variant="ghost">
            <ChevronLeftIcon />
            <span data-slot="visually-hidden">Previous</span>
          </PaginationPrevious>
        </PaginationItem>
        <PaginationItem v-for="item in state.items" :key="item">
          <PaginationLink
            v-if="typeof item === 'number'"
            data-variant="ghost"
            :page="item"
          />
          <PaginationEllipsis v-else>
            <EllipsisIcon />
          </PaginationEllipsis>
        </PaginationItem>
        <PaginationItem>
          <PaginationNext data-variant="ghost">
            <span data-slot="visually-hidden">Next</span>
            <ChevronRightIcon />
          </PaginationNext>
        </PaginationItem>
      </PaginationList>
    </Pagination>
  </div>
</template>
