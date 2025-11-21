document.getElementById("btnCargar").addEventListener("click", async () => {
    const url = "escuelas.csv.csv"; // Se usa exactamente el nombre que subiste

    const respuesta = await fetch(url);
    const texto = await respuesta.text();

    const filas = texto.trim().split("\n");

    const tabla = document.querySelector("#tabla tbody");
    tabla.innerHTML = "";

    filas.slice(1).forEach(linea => { // Se salta el encabezado
        const [escuela, cupos] = linea.split(",");

        const fila = document.createElement("tr");

        fila.innerHTML = `
            <td>${escuela}</td>
            <td>${cupos}</td>
        `;

        tabla.appendChild(fila);
    });
});
