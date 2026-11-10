import React, { useState } from "react";
import { SafeAreaView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import LegacyMASApp from "./App";
import StoreScreen from "./src/screens/StoreScreen";

export default function NativeRoot() {
  const [showLegacySpaces, setShowLegacySpaces] = useState(false);
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#F6F7FB" />
      <View style={styles.header}>
        {showLegacySpaces ? <TouchableOpacity accessibilityRole="button" onPress={() => setShowLegacySpaces(false)}><Text style={styles.back}>‹ Store</Text></TouchableOpacity> : <Text style={styles.brand}>MAS · Discover</Text>}
        <TouchableOpacity accessibilityRole="button" onPress={() => setShowLegacySpaces((current) => !current)} style={styles.switch}>
          <Text style={styles.switchText}>{showLegacySpaces ? "Store" : "Developer & Social"}</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.body}>{showLegacySpaces ? <LegacyMASApp /> : <StoreScreen />}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({ safeArea: { flex: 1, backgroundColor: "#F6F7FB" }, header: { minHeight: 48, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "#FFF", borderBottomWidth: 1, borderBottomColor: "#E7EBF3" }, brand: { color: "#111827", fontSize: 15, fontWeight: "800" }, back: { color: "#1877F2", fontSize: 14, fontWeight: "700" }, switch: { minHeight: 34, justifyContent: "center", paddingHorizontal: 10, borderRadius: 9, backgroundColor: "#EFF4FA" }, switchText: { color: "#1877F2", fontSize: 11, fontWeight: "700" }, body: { flex: 1 } });
