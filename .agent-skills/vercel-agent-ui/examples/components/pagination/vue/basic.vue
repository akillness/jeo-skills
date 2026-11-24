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
import { useLog } from "../../../shared/vue/log"

const log = useLog()
</script>

<template>
  <Pagination
    aria-label="Pagination"
    :page-count="10"
    @page-change="(page, details) => log(`Page ${page} (${details.reason})`)"
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
</template>
