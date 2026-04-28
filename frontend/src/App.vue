<template>
  <div class="app-layout">
    <Sidebar :pages="pages" :activePage="activePage" @navigate="activePage = $event" />
    <main class="app-main">
      <WebsitesPage    v-if="activePage === 'websites'" />
      <ContainersPage  v-if="activePage === 'containers'" />
      <CaddyPage       v-if="activePage === 'caddy'" />
      <MacMiniPage     v-if="activePage === 'macmini'" />
      <MachinesPage    v-if="activePage === 'machines'" />
      <TvsPage         v-if="activePage === 'tvs'" />
      <ClientsPage     v-if="activePage === 'clients'" />
      <PrintPage       v-if="activePage === 'print'" />
    </main>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import Sidebar from './components/layout/Sidebar.vue';
import WebsitesPage from './views/WebsitesPage.vue';
import ContainersPage from './views/ContainersPage.vue';
import CaddyPage from './views/CaddyPage.vue';
import MacMiniPage from './views/MacMiniPage.vue';
import MachinesPage from './views/MachinesPage.vue';
import TvsPage from './views/TvsPage.vue';
import ClientsPage from './views/ClientsPage.vue';
import PrintPage from './views/PrintPage.vue';

const pages = ref([]);
const activePage = ref('websites');

onMounted(async () => {
  try {
    const res = await fetch('/api/pages');
    pages.value = await res.json();
    if (pages.value.length) activePage.value = pages.value[0].slug;
  } catch { /* use default */ }
});
</script>

<style scoped>
.app-layout {
  display: flex;
  height: 100vh;
  overflow: hidden;
}

.app-main {
  flex: 1;
  overflow-y: auto;
  background: var(--bg-base);
}
</style>
