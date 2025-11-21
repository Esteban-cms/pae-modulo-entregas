console.log("Nutrición App lista");

// --- Función principal ---
async function cargarDatos() {
    try {
        // Cargar escuelas.csv
        const escuelasData = await fetch('escuelas.csv').then(r => r.text());

        // Cargar semanas 1 a 4
        const semanasData = [];
        for (let i = 1; i <= 4; i++) {
            const archivo = `Semana ${i}.csv`; // Nombres EXACTOS
            console.log("Cargando:", archivo);

            const data = await fetch(archivo).then(r => r.text());
            semanasData.push(data);
        }

        // Mostrar resultado en pantalla
        mostrarConfirmacion();

        console.log("Escuelas:", escuelasData);
        console.log("Semanas cargadas:", semanasData);

    } catch (error) {
        console.error("Error cargando archivos:", error);
        document.getElementById("resultado").innerHTML =
            "<p style='color:red;'>Error cargando archivos CSV.</p>";
    }
}

// --- Mostrar mensaje en la página ---
function mostrarConfirmacion() {
    document.getElementById("resultado").innerHTML = `
        <p style='color:green; font-weight:bold;'>
            ✔ Archivos cargados correctamente
        </p>
    `;
}

// --- Ejecutar automáticamente ---
document.addEventListener("DOMContentLoaded", cargarDatos);
