// File: components/DisclaimerModal.jsx
import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";

export default function DisclaimerModal({ onAccept, onDecline }) {
  return (
    <View style={styles.overlay}>
      <View style={styles.modal}>
        <Text style={styles.title}>Disclaimer</Text>
        <Text style={styles.text}>
          SmartBarangay is a mobile app made for an easy way to connect with your barangay. You can request documents, report concerns, and get the latest community news all in one place. It makes dealing with barangay tasks faster, simpler, and keeps you updated on what’s happening in your neighborhood. With SmartBarangay, helping the community fast is the key to having a developed community.
        </Text>

        <View style={styles.buttons}>
          <Pressable style={[styles.button, styles.agree]} onPress={onAccept}>
            <Text style={styles.buttonText}>Agree & Continue</Text>
          </Pressable>

          <Pressable style={[styles.button, styles.cancel]} onPress={onDecline}>
            <Text style={styles.buttonText}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.6)",
    padding: 20,
  },
  modal: {
    width: "100%",
    backgroundColor: "white",
    borderRadius: 12,
    padding: 20,
    alignItems: "center",
  },
  title: {
    fontSize: 22,
    fontWeight: "bold",
    marginBottom: 15,
    color: "#5a48d8",
    textAlign: "center",
  },
  text: {
    fontSize: 15,
    color: "#333",
    marginBottom: 25,
    textAlign: "center",
  },
  buttons: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
    marginHorizontal: 5,
  },
  agree: {
    backgroundColor: "#5a48d8",
  },
  cancel: {
    backgroundColor: "#ccc",
  },
  buttonText: {
    color: "white",
    fontWeight: "bold",
    fontSize: 16,
  },
});
