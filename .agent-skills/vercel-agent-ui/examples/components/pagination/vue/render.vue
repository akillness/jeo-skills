<script setup lang="ts">
import { ArrowLeftIcon, ArrowRightIcon } from "@lucide/vue"
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
  <Pagination aria-label="Pagination" :page-count="10">
    <PaginationList v-slot="{ state }">
      <PaginationItem>
        <PaginationPrevious aria-label="Previous page">
          <template #render="{ props, state: step }">
            <button
              v-bind="props"
              :title="step.disabled ? undefined : `Go to page ${step.page}`"
            >
              <ArrowLeftIcon aria-hidden="true" />
              <span v-if="!step.disabled" aria-hidden="true">{{
                step.page
              }}</span>
            </button>
          </template>
        </PaginationPrevious>
      </PaginationItem>
      <PaginationItem v-for="item in state.items" :key="item">
        <PaginationLink
          v-if="typeof item === 'number'"
          v-slot="{ state: link }"
          :page="item"
        >
          {{ link.current ? `Page ${link.page}` : link.page }}
        </PaginationLink>
        <PaginationEllipsis v-else />
      </PaginationItem>
      <PaginationItem>
        <PaginationNext aria-label="Next page">
          <template #render="{ props, state: step }">
            <button
              v-bind="props"
              :title="step.disabled ? undefined : `Go to page ${step.page}`"
            >
              <span v-if="!step.disabled" aria-hidden="true">{{
                step.page
              }}</span>
              <ArrowRightIcon aria-hidden="true" />
            </button>
          </template>
        </PaginationNext>
      </PaginationItem>
    </PaginationList>
  </Pagination>
</template>
