<template>
  <backdrop />
  <v-app>
    <router-view-transition is-root />
    <snackbar />
    <pip-video-player />
  </v-app>
  <player-element />
</template>
