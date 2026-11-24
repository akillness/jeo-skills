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
</script>

<template>
  <div dir="rtl">
    <Pagination aria-label="ترقيم الصفحات" :page-count="10">
      <PaginationList v-slot="{ state }">
        <PaginationItem>
          <PaginationPrevious data-variant="ghost">
            <ChevronLeftIcon />
            <span data-slot="visually-hidden">السابق</span>
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
            <span data-slot="visually-hidden">التالي</span>
            <ChevronRightIcon />
          </PaginationNext>
        </PaginationItem>
      </PaginationList>
    </Pagination>
  </div>
</template>
