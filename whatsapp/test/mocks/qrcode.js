export default {
  toDataURL: async (texto) => "data:image/png;base64," + Buffer.from(texto).toString("base64"),
};
