"""
main.py
Streamlit app to generate actas de víveres y reporte consolidado para entregas PAE.
Instrucciones de uso (README mínima):
- Subir: schools CSV (school_id,name,students opcional), semana1..semana4 CSV (Menu,Producto,Cantidad,Unidad,Empaque)
- Editar el número de estudiantes en la tabla antes de generar la entrega (se ingresa cada vez que se hace una entrega)
- Asignar menús por día (5 días) para Semana 3 y Semana 4
- Presionar "Generar actas y reporte" para obtener: ZIP con actas por sede (CSV) y reporte consolidado (CSV)

Requisitos:
- streamlit
- pandas

Ejemplo de ejecución:
$ streamlit run main.py
"""

import streamlit as st
import pandas as pd
import io, zipfile, re, math
from collections import defaultdict

st.set_page_config(page_title="Actas de Viveres PAE — Generador", layout="wide")
st.title("Generador de Actas de Víveres PAE — Ingrese matrícula por entrega")

st.markdown("""
Este aplicativo permite:
- Cargar las minutas (semana1..semana4) y el listado de sedes (schools.csv)
- Editar la matrícula por sede en el momento de la entrega
- Asignar menús por día para Semana 3 y Semana 4
- Generar actas por sede (CSV) y un reporte consolidado (CSV) listo para el operador
""")

# ---------- Upload files ----------
st.sidebar.header("Archivos (subir)")
schools_file = st.sidebar.file_uploader("CSV: escuelas (school_id,name,students opcional)", type=["csv"]) 
sem1 = st.sidebar.file_uploader("CSV: semana1.csv", type=["csv"]) 
sem2 = st.sidebar.file_uploader("CSV: semana2.csv", type=["csv"]) 
sem3 = st.sidebar.file_uploader("CSV: semana3.csv", type=["csv"]) 
sem4 = st.sidebar.file_uploader("CSV: semana4.csv", type=["csv"]) 

# Utility to load menu csv
def load_menu_csv(f):
    if f is None:
        return pd.DataFrame(columns=["Menu","Producto","Cantidad","Unidad","Empaque"]) 
    df = pd.read_csv(f)
    df.columns = [c.strip() for c in df.columns]
    # ensure expected columns
    for c in ["Menu","Producto","Cantidad","Unidad","Empaque"]:
        if c not in df.columns:
            df[c] = "" 
    # normalize
    df["Menu"] = pd.to_numeric(df["Menu"], errors="coerce").astype('Int64')
    df["Cantidad"] = pd.to_numeric(df["Cantidad"], errors="coerce").fillna(0)
    return df[["Menu","Producto","Cantidad","Unidad","Empaque"]]

# load all menus
menus_all = pd.concat([load_menu_csv(f) for f in [sem1,sem2,sem3,sem4]], ignore_index=True)
menu_ids = sorted(menus_all["Menu"].dropna().unique().tolist())

# ---------- Datos generales de entrega ----------
st.sidebar.header("Datos generales de la entrega")
datos = {}
datos['operador'] = st.sidebar.text_input("Operador", value="JOHN FREDDY ALZATE ZAPATA")
datos['municipio'] = st.sidebar.text_input("Municipio", value="BRICEÑO")
datos['subregion'] = st.sidebar.text_input("Subregion", value="NORTE")
datos['lugar_entrega'] = st.sidebar.text_input("Lugar de entrega", value="CARRERA 10 NR 12-02")
datos['vehiculo'] = st.sidebar.text_input("Vehículo/Marca", value="CHEVROLET")
datos['placa'] = st.sidebar.text_input("Placa", value="LK0959")
datos['fecha_entrega'] = st.sidebar.date_input("Fecha de entrega")
datos['hora_entrega'] = st.sidebar.text_input("Hora de entrega", value="9:00 AM")
datos['n_entrega'] = st.sidebar.text_input("N° de entrega", value="8")
datos['desde'] = st.sidebar.date_input("Fecha consumo - Desde")
datos['hasta'] = st.sidebar.date_input("Fecha consumo - Hasta")
datos['n_dias'] = st.sidebar.number_input("Número de días de consumo (por semana)", value=5, min_value=1)

# ---------- Schools (editable) ----------
if schools_file is None:
    st.warning("Sube el archivo schools.csv para continuar. Debe incluir columnas: school_id,name (o sede), students (opcional).")
    st.stop()

schools_df = pd.read_csv(schools_file)
schools_df.columns = [c.strip() for c in schools_df.columns]
if 'school_id' not in schools_df.columns:
    schools_df.insert(0,'school_id', range(1, len(schools_df)+1))
if 'name' not in schools_df.columns and 'sede' in schools_df.columns:
    schools_df.rename(columns={'sede':'name'}, inplace=True)
if 'students' not in schools_df.columns:
    schools_df['students'] = 0

st.subheader("Centros educativos — editar matrícula por entrega")
editable = st.experimental_data_editor(schools_df[['school_id','name','students']], num_rows='dynamic', use_container_width=True)
editable['students'] = pd.to_numeric(editable['students'], errors='coerce').fillna(0).astype(int)

# ---------- Menu assignment (Semana 3 & 4) ----------
st.subheader("Asignación de menús por sede — Semana 3 y Semana 4")
if not menu_ids:
    st.warning("No hay menús cargados. Sube los CSV de las semanas en la barra lateral.")
    st.stop()

# default helper
def default_menu_list():
    if len(menu_ids) >= 5:
        return menu_ids[:5]
    return [menu_ids[0]]*5

assignments = {}
for idx, row in editable.iterrows():
    st.markdown(f"**{row['school_id']} — {row['name']}** — Estudiantes: {row['students']}")
    cols = st.columns([1,]*6)
    cols[0].write("Semana 3")
    week3 = []
    for d in range(5):
        sel = cols[d+1].selectbox(f"3_{idx}_{d}", options=menu_ids, index=0, key=f"3_{idx}_{d}")
        week3.append(sel)
    cols2 = st.columns([1,]*6)
    cols2[0].write("Semana 4")
    week4 = []
    for d in range(5):
        sel = cols2[d+1].selectbox(f"4_{idx}_{d}", options=menu_ids, index=0, key=f"4_{idx}_{d}")
        week4.append(sel)
    assignments[row['school_id']] = {
        'name': row['name'],
        'students': int(row['students']),
        'week3': week3,
        'week4': week4
    }

# ---------- Utilities ----------
# extract packaging size (grams/cc) from Unidad or Empaque strings
import typing

def extract_pack_size(text: typing.Any) -> typing.Optional[int]:
    if not isinstance(text, str):
        return None
    t = text.lower()
    # replace kg with 1000g
    t = t.replace('kg','000g') if 'kg' in t else t
    m = re.search(r"(\d+(?:[\.,]\d+)?)\s*(gr|g|cc|ml)", t)
    if m:
        v = m.group(1).replace(',','.')
        try:
            return int(float(v))
        except:
            return None
    # try pure number
    m2 = re.search(r"(\d+)\b", t)
    if m2:
        try:
            return int(m2.group(1))
        except:
            return None
    return None

# build menu lookup
menu_lookup = {m: menus_all[menus_all['Menu']==m].copy() for m in menu_ids}

# ---------- Generate actas and consolidated ----------
st.subheader("Generar actas y reporte consolidado")
if st.button("Generar actas y reporte"):
    actas = {}
    consolidated_units = defaultdict(float)  # key = (Producto, Unidad, Empaque) -> unidades a entregar (entregadas)
    warnings = []

    for school_id, info in assignments.items():
        students = info['students']
        product_acc = {}  # key (prod,unidad,empaque) -> aggregated week values

        def add_week(week_list, week_label):
            # sum grams per student across 5 menus of the week
            week_sum = defaultdict(float)
            for mid in week_list:
                dfm = menu_lookup.get(int(mid))
                if dfm is None or dfm.empty:
                    continue
                for _, r in dfm.iterrows():
                    key = (r['Producto'], r['Unidad'], r['Empaque'])
                    week_sum[key] += float(r['Cantidad'])
            # apply
            for key, gr_cupo in week_sum.items():
                if key not in product_acc:
                    product_acc[key] = {
                        'Producto': key[0], 'Unidad': key[1], 'Empaque': key[2],
                        'gr_x_cupo_week3': 0.0, 'gr_x_total_week3': 0.0,
                        'gr_x_cupo_week4': 0.0, 'gr_x_total_week4': 0.0,
                        'empaque_size': None
                    }
                if week_label == 3:
                    product_acc[key]['gr_x_cupo_week3'] = gr_cupo
                    product_acc[key]['gr_x_total_week3'] = gr_cupo * students
                else:
                    product_acc[key]['gr_x_cupo_week4'] = gr_cupo
                    product_acc[key]['gr_x_total_week4'] = gr_cupo * students
                # determine empaque size
                if product_acc[key]['empaque_size'] is None:
                    pack = extract_pack_size(str(key[1])) or extract_pack_size(str(key[2]))
                    if pack is None or pack == 0:
                        # fallback: try known common sizes
                        pack = 1
                        warnings.append(f"No se pudo extraer tamaño de empaque para '{key[0]}'. Se usará 1 como empaque por defecto.")
                    product_acc[key]['empaque_size'] = pack

        add_week(info['week3'], 3)
        add_week(info['week4'], 4)

        # build dataframe rows
        rows = []
        for k,v in product_acc.items():
            total_w3 = v['gr_x_total_week3']
            total_w4 = v['gr_x_total_week4']
            suma_total = total_w3 + total_w4
            pack = v['empaque_size'] if v['empaque_size'] else 1
            cantidad_sin_redondear = suma_total / pack if pack != 0 else 0
            cantidad_entregada = math.ceil(cantidad_sin_redondear) if cantidad_sin_redondear>0 else 0
            rows.append({
                'Producto': v['Producto'],
                'Unidad': v['Unidad'],
                'Empaque': v['Empaque'],
                'Gr x cupo S3': v['gr_x_cupo_week3'],
                'Gr x total cupos S3': v['gr_x_total_week3'],
                'Gr x cupo S4': v['gr_x_cupo_week4'],
                'Gr x total cupos S4': v['gr_x_total_week4'],
                'Empaque_g': pack,
                'Cantidad_sin_redondear': cantidad_sin_redondear,
                'Cantidad_entregada_unidades': int(cantidad_entregada)
            })
            consolidated_units[(v['Producto'], v['Unidad'], v['Empaque'])] += cantidad_entregada

        df_acta = pd.DataFrame(rows).sort_values('Producto').reset_index(drop=True)
        # prepend metadata as simple key,value CSV lines
        meta = [
            ("operador", datos['operador']), ("municipio", datos['municipio']), ("subregion", datos['subregion']),
            ("lugar_entrega", datos['lugar_entrega']), ("vehiculo", datos['vehiculo']), ("placa", datos['placa']),
            ("fecha_entrega", str(datos['fecha_entrega'])), ("hora_entrega", datos['hora_entrega']), ("n_entrega", datos['n_entrega']),
            ("school_id", school_id), ("school_name", info['name']), ("students", students),
            ("fecha_desde", str(datos['desde'])), ("fecha_hasta", str(datos['hasta'])), ("n_dias", datos['n_dias'])
        ]
        buf = io.StringIO()
        for k,vv in meta:
            buf.write(f"{k},{vv}\n")
        buf.write('\n')
        df_acta.to_csv(buf, index=False)
        actas[f"acta_school_{school_id}.csv"] = buf.getvalue().encode('utf-8')

    # consolidated DF
    cons_rows = []
    for (prod, unidad, empaque), unidades in consolidated_units.items():
        cons_rows.append({'Producto': prod, 'Unidad': unidad, 'Empaque': empaque, 'Cantidad_entregada_unidades': int(unidades)})
    df_cons = pd.DataFrame(cons_rows).sort_values('Producto').reset_index(drop=True)

    # show warnings
    if warnings:
        st.warning('Advertencias: ' + '; '.join(list(set(warnings))[:5]))

    st.success('Actas generadas — vista previa del reporte consolidado:')
    st.dataframe(df_cons, use_container_width=True)

    # downloads
    st.download_button('Descargar reporte consolidado (CSV)', data=df_cons.to_csv(index=False).encode('utf-8'), file_name='reporte_consolidado.csv', mime='text/csv')

    # zip actas
    zip_buf = io.BytesIO()
    with zipfile.ZipFile(zip_buf, 'w') as zf:
        for fname, content in actas.items():
            zf.writestr(fname, content)
    zip_buf.seek(0)
    st.download_button('Descargar actas (ZIP)', data=zip_buf.getvalue(), file_name='actas_sedes.zip', mime='application/zip')

    # individual downloads
    st.markdown('Actas individuales:')
    for fname, content in actas.items():
        st.download_button(fname, data=content, file_name=fname, mime='text/csv')

    st.info('Las cantidades se calcularon como: Gr x total cupos (S3+S4) / Empaque_g → Cantidad sin redondear; Cantidad entregada = ceil(cantidad sin redondear).')

# EOF
