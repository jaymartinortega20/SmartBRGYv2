import { DateTimePickerAndroid } from "@react-native-community/datetimepicker";

// Opens Android's native date/time dialog once and reports the chosen value.
// Rendering <DateTimePicker> inside a Modal on Android re-opens the dialog on
// every re-render (for example when the value changes), so the imperative API
// is used instead.
export function openNativePicker({ value, mode = "date", minimumDate, maximumDate, onConfirm, is24Hour = false }) {
  DateTimePickerAndroid.open({
    value: value instanceof Date && !Number.isNaN(value.getTime()) ? value : new Date(),
    mode,
    display: "default",
    is24Hour,
    minimumDate,
    maximumDate,
    onChange: (event, selected) => {
      if (event?.type === "set" && selected) onConfirm(selected);
    },
  });
}
