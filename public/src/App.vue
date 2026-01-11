<template>
  <div id="static-background"></div>
  <router-view></router-view>
</template>

<script setup>
</script>

<style lang="css" scoped>
body,
html {
  margin: 0;
  padding: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  position: relative;
}

#static-background {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: -1;
  background: linear-gradient(135deg, #e0e7ff 0%, #fae8ff 50%, #fef3c7 100%);
}
</style>