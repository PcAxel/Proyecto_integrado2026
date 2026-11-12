"""Catálogo de demostración: ~1000 artículos de refrigeración industrial, generados por familias (tipo × medida).

Todo es ficticio pero verosímil: nombres, unidades, costos en pesos chilenos netos y stock mínimo. Es determinista: el mismo `rng`
produce siempre el mismo catálogo. Cada artículo lleva SKU único, que es lo que codifica el QR de su sticker."""
from itertools import product

DIAM = ['1/4"', '3/8"', '1/2"', '5/8"', '3/4"', '7/8"', '1 1/8"', '1 3/8"', '1 5/8"']
F_DIAM = [1.0, 1.25, 1.6, 2.0, 2.6, 3.2, 4.4, 6.0, 8.0]  # el costo crece con el diámetro
PROVEEDOR_POR_CATEGORIA = {  # índice 0..13 en la lista de proveedores
    'Refrigerantes': [0, 1], 'Compresores': [1, 5], 'Cobre y soldadura': [3, 9], 'Aislación': [4, 10], 'Paneles y cámaras': [10, 11],
    'Válvulas y filtros': [0, 1, 5], 'Evaporación y condensación': [1, 5, 6], 'Eléctrico': [2, 7], 'Control': [2, 7, 8],
    'Fijaciones': [12, 13], 'Lubricantes': [0, 6], 'Herramientas y EPP': [12, 13], 'Insumos': [12, 13, 0],
}


def _redondeo(c):
    return int(round(c, -1)) if c >= 500 else max(1, int(round(c)))


def _familias():
    """(categoría, unidad, prefijo de SKU, nombre, costo base)."""
    F = []
    add = lambda cat, un, pre, nombre, costo: F.append((cat, un, pre, nombre, costo))

    gases = {'R404A': 9800, 'R507': 10700, 'R134a': 8200, 'R410A': 9900, 'R407C': 9300, 'R448A': 11200, 'R449A': 11000, 'R452A': 11800,
             'R22': 14500, 'R290': 12500, 'R600a': 13400, 'R717 (amoníaco)': 5200, 'R744 (CO₂)': 4800, 'R32': 9100, 'R1234yf': 28000, 'R450A': 10400}
    for g, kilo in gases.items():
        for fmt, kg in (('cilindro 5 kg', 5), ('cilindro 11 kg', 11), ('cilindro 13,6 kg', 13.6)):
            add('Refrigerantes', 'cil', 'REF', f'Refrigerante {g} {fmt}', kilo * kg)
    for t, base in (('rollo ACR 15 m', 8500), ('tramo tipo L 6 m', 9200), ('tramo tipo K 6 m', 11800), ('tramo tipo M 6 m', 7400)):
        for d, f in zip(DIAM, F_DIAM):
            add('Cobre y soldadura', 'un', 'CU', f'Cañería de cobre {t} {d}', base * f)
    for nom, base, pre in (('Codo 90°', 420, 'CD'), ('Codo 45°', 400, 'C45'), ('Tee', 700, 'TEE'), ('Reducción', 520, 'RED'), ('Unión', 330, 'UN'), ('Tapón', 380, 'TAP'),
                           ('Adaptador macho flare', 1100, 'AMF'), ('Adaptador hembra flare', 1050, 'AHF'), ('Curva de retorno 180°', 650, 'CR'), ('Copla de reparación', 360, 'CRP')):
        for d, f in zip(DIAM, F_DIAM):
            add('Cobre y soldadura', 'un', pre, f'{nom} de cobre {d}', base * f)
    for pct, base in ((0, 3800), (2, 7200), (5, 14500), (15, 24500), (35, 41000), (45, 52000)):
        for pres, m in (('varilla 1 kg', 1), ('varilla 500 g', 0.55), ('varilla x 10 un', 0.18)):
            add('Cobre y soldadura', 'un', 'SOL', f'Varilla soldadura plata {pct} % {pres}', base * m)
    for nom, base in (('Fundente para soldar 250 g', 5900), ('Oxígeno industrial cilindro 6 m³', 21000), ('Acetileno industrial cilindro 4 kg', 38000), ('Boquilla soplete n.º 2', 4200),
                      ('Boquilla soplete n.º 4', 4600), ('Regulador de oxígeno', 28900), ('Regulador de acetileno', 31900), ('Antorcha de soldar con mango', 36500), ('Nitrógeno seco cilindro 6 m³', 24000)):
        add('Cobre y soldadura', 'un', 'SOP', nom, base)

    for esp in (9, 13, 19, 25, 32):
        for d, f in zip(DIAM, F_DIAM):
            add('Aislación', 'm', 'AIS', f'Coquilla aislante {d} espesor {esp} mm', 780 * f * (1 + esp / 40))
    for esp in (6, 10, 13, 19, 25, 32):
        add('Aislación', 'm²', 'AIP', f'Plancha elastomérica adhesiva {esp} mm', 6800 + esp * 460)
    for nom, base in (('Cinta aislante PVC negra 20 m', 1900), ('Cinta aluminio 50 mm x 45 m', 5200), ('Cinta aislante elastomérica 3 mm x 15 m', 4300), ('Espuma de poliuretano 750 ml', 7300),
                      ('Adhesivo de contacto para elastómero 1 L', 15800), ('Sellador de juntas 300 ml', 4900), ('Cinta butílica 50 mm x 10 m', 8800), ('Lana mineral rollo 50 mm', 21400)):
        add('Aislación', 'un', 'AIC', nom, base)

    for esp in (60, 80, 100, 120, 150, 200):
        for tipo, f in (('de muro', 1.0), ('de techo', 1.08), ('de piso', 1.15)):
            for term, ft in (('PIR', 1.15), ('PUR', 1.0)):
                add('Paneles y cámaras', 'm²', 'PAN', f'Panel {term} {tipo} {esp} mm', (8400 + esp * 125) * f * ft)
    for nom, base in (('Perfil U de remate 100 mm', 3800), ('Perfil esquinero interior', 2900), ('Perfil esquinero exterior', 3100), ('Sellador poliuretano para panel 600 ml', 7600),
                      ('Cortina PVC de cámara 2 m', 87500), ('Cortina PVC de cámara 3 m', 128000), ('Burlete de puerta cámara 5 m', 24000), ('Bisagra de puerta frigorífica', 61000),
                      ('Cerradura de seguridad para cámara', 94000), ('Manilla interior de emergencia', 47500), ('Calefactor de marco de puerta 24 V', 38200), ('Respirador de presión cámara', 56000)):
        add('Paneles y cámaras', 'un', 'PCA', nom, base)
    for ancho, alto in ((800, 1900), (1000, 2000), (1200, 2100), (1500, 2200), (2000, 2400), (3000, 3000)):
        for t, f in (('batiente', 1.0), ('corredera', 1.45), ('de alto tráfico', 2.1)):
            add('Paneles y cámaras', 'un', 'PUE', f'Puerta frigorífica {t} {ancho} x {alto} mm', (ancho * alto / 1000) * 215 * f)
    for w, base in ((9, 11900), (18, 15800), (24, 19400), (36, 28800), (48, 36500)):
        for t, f in (('hermética IP65', 1.0), ('antiexplosiva', 1.9), ('de baja temperatura -30 °C', 1.3)):
            add('Paneles y cámaras', 'un', 'LUM', f'Luminaria LED {t} {w} W', base * f)

    for d in ('1/4"', '3/8"', '1/2"', '5/8"', '7/8"'):
        for tens, f in (('NC 220 V', 1.0), ('NC 24 V', 1.0), ('NA 220 V', 1.1)):
            add('Válvulas y filtros', 'un', 'VSL', f'Válvula solenoide {d} {tens}', 36000 * F_DIAM[DIAM.index(d)] ** 0.6 * f)
    for g in ('R404A', 'R134a', 'R507', 'R410A', 'R448A'):
        for o in (1, 2, 3, 4):
            add('Válvulas y filtros', 'un', 'VTE', f'Válvula de expansión termostática {g} orificio n.º {o}', 41000 + o * 6200)
    for d, f in zip(DIAM, F_DIAM):
        add('Válvulas y filtros', 'un', 'VRT', f'Válvula de retención {d}', 11500 * f ** 0.7)
        add('Válvulas y filtros', 'un', 'VBO', f'Válvula de bola para refrigeración {d}', 9800 * f ** 0.7)
        add('Válvulas y filtros', 'un', 'VBS', f'Válvula de servicio con puerto {d}', 12900 * f ** 0.7)
        for tipo, ft in (('soldable', 1.0), ('flare', 0.95), ('de alta capacidad', 1.6)):
            add('Válvulas y filtros', 'un', 'FIL', f'Filtro secador {tipo} {d}', 9500 * f ** 0.65 * ft)
        add('Válvulas y filtros', 'un', 'MIR', f'Mirilla con indicador de humedad {d}', 14500 * f ** 0.5)
        add('Válvulas y filtros', 'un', 'SEP', f'Separador de líquido {d}', 34000 * f ** 0.6)
    for nom, base in (('Válvula Schrader 1/4"', 790), ('Núcleo válvula Schrader', 420), ('Tapa válvula Schrader', 280), ('Válvula reguladora de presión de evaporación 5/8"', 124000),
                      ('Válvula reguladora de presión de condensación 7/8"', 148000), ('Presostato de aceite', 51500), ('Separador de aceite 5/8"', 93500), ('Receptor de líquido 10 L', 116000),
                      ('Receptor de líquido 25 L', 189000), ('Acumulador de succión 3/4"', 87500)):
        add('Válvulas y filtros', 'un', 'VAR', nom, base)

    for tipo, base in (('hermético', 118000), ('scroll', 245000), ('semihermético', 540000), ('de pistón abierto', 465000)):
        for marca, fm in (('Copeland', 1.12), ('Danfoss', 1.0), ('Bitzer', 1.18), ('Tecumseh', 0.9)):
            for hp in (1, 1.5, 2, 3, 4, 5, 7.5, 10, 15):
                add('Compresores', 'un', 'CMP', f'Compresor {tipo} {marca} {hp} HP'.replace('.', ','), base * (hp ** 0.82) * fm)
    for nom, base in (('Kit de reparación de compresor', 64000), ('Calefactor de cárter 100 W', 14800), ('Amortiguador antivibratorio compresor', 7200), ('Kit de arranque compresor', 22800)):
        add('Compresores', 'un', 'CMA', nom, base)

    for tipo, base in (('de cielo', 380000), ('de pared', 420000), ('de piso', 510000), ('cúbico de doble flujo', 640000)):
        for kw in (1.5, 2.5, 4, 6, 8, 12):
            add('Evaporación y condensación', 'un', 'EVA', f'Evaporador {tipo} {kw} kW'.replace('.', ','), base * kw ** 0.8)
    for tipo, base in (('enfriado por aire', 410000), ('compacto hermético', 330000), ('remoto con ventilador axial', 560000)):
        for hp in (1, 2, 3, 5, 7.5, 10, 15):
            add('Evaporación y condensación', 'un', 'CON', f'Condensador {tipo} {hp} HP'.replace('.', ','), base * hp ** 0.75)
    for diam in (200, 250, 300, 350, 400, 450, 500, 630):
        for fase, f in (('monofásico 220 V', 1.0), ('trifásico 380 V', 1.18)):
            add('Evaporación y condensación', 'un', 'VEN', f'Ventilador axial {diam} mm {fase}', 41000 + diam * 195 * f)
    for hp, base in (('1/15', 38900), ('1/10', 46800), ('1/8', 53500), ('1/4', 71200), ('1/3', 86500), ('1/2', 112000)):
        for t, f in (('de polos sombreados', 1.0), ('EC de alta eficiencia', 1.9)):
            add('Evaporación y condensación', 'un', 'MOT', f'Motor de ventilador {t} {hp} HP', base * f)
    for largo in (600, 800, 1000, 1200, 1500, 1800, 2000, 2400):
        add('Evaporación y condensación', 'un', 'RES', f'Resistencia de deshielo {largo} mm 220 V', 12800 + largo * 14)

    for awg, base in ((18, 360), (16, 470), (14, 650), (12, 980), (10, 1500), (8, 2300), (6, 3500), (4, 5400)):
        for color in ('rojo', 'negro', 'azul', 'verde', 'blanco'):
            add('Eléctrico', 'm', 'CAB', f'Cable THHN {awg} AWG {color}', base)
    for sec in ('3x1,5', '3x2,5', '4x1,5', '4x2,5', '5x2,5', '3x4', '4x4', '4x6', '4x10'):
        add('Eléctrico', 'm', 'CAM', f'Cable multiconductor flexible {sec} mm²', 1700 + sum(map(float, [s.replace(',', '.') for s in sec.split('x')])) * 900)
    for amp, base in ((9, 11800), (12, 13800), (18, 17500), (25, 24500), (32, 33800), (40, 47800), (50, 66500), (65, 87500), (80, 112000), (95, 139000)):
        for bob, f in (('bobina 24 V', 1.0), ('bobina 220 V', 1.0), ('bobina 380 V', 1.05)):
            add('Eléctrico', 'un', 'CTR', f'Contactor {amp} A {bob}', base * f)
    for rango in ('0,1–0,16', '0,4–0,63', '1–1,6', '2,5–4', '4–6', '6–10', '9–13', '12–18', '17–25', '23–32', '30–40', '48–65'):
        add('Eléctrico', 'un', 'RTM', f'Relé térmico {rango} A', 21900 + len(rango) * 700)
        add('Eléctrico', 'un', 'GRD', f'Guardamotor {rango} A', 24800 + len(rango) * 800)
    for amp, base in ((6, 4800), (10, 5200), (16, 5900), (20, 6400), (25, 7100), (32, 8200), (40, 10500), (50, 12900), (63, 16800), (80, 25800)):
        for polos, f in (('1P', 1.0), ('2P', 2.0), ('3P', 3.1)):
            add('Eléctrico', 'un', 'AUT', f'Interruptor automático {polos} {amp} A', base * f)
    for uf in (5, 7.5, 10, 12.5, 15, 20, 25, 30, 40, 50, 60, 80):
        for v, f in (('370 V', 1.0), ('440 V', 1.2)):
            add('Eléctrico', 'un', 'CAP', f'Condensador de trabajo {uf} µF {v}'.replace('.', ','), (3200 + uf * 240) * f)
    for uf in (88, 108, 161, 189, 233, 270, 324):
        add('Eléctrico', 'un', 'CAR', f'Condensador de partida {uf} µF 220 V', 4800 + uf * 28)
    for nom, base in (('Relé de potencial', 15800), ('Relé de arranque PTC', 6200), ('Terminal ojo aislado x 100', 4800), ('Terminal pin aislado x 100', 4200), ('Terminal pala aislado x 100', 4400),
                      ('Bornera de paso 4 mm² x 10', 5600), ('Riel DIN 35 mm 1 m', 2800), ('Canaleta ranurada 40 x 40 mm 2 m', 5300), ('Prensaestopa PG-13,5', 640), ('Prensaestopa PG-21', 980),
                      ('Cinta de amarre 200 mm x 100', 2300), ('Tubo conduit EMT 3/4" 3 m', 3900), ('Caja de paso estanca 150 x 110', 5200), ('Gabinete eléctrico 400 x 300 x 200', 38900),
                      ('Pulsador de emergencia hongo', 8200), ('Luz piloto LED 22 mm', 2900), ('Selector de 3 posiciones', 5800), ('Transformador 220/24 V 40 VA', 14500)):
        add('Eléctrico', 'un', 'ELO', nom, base)

    for rango in ('-30 a 10 °C', '-40 a 20 °C', '0 a 40 °C', '-20 a 80 °C', '-50 a 150 °C', '5 a 35 °C'):
        add('Control', 'un', 'TER', f'Termostato electromecánico {rango}', 18900 + len(rango) * 320)
    for mod, base in (('Controlador digital de cámara 1 relé', 51000), ('Controlador digital de cámara 3 relés', 78500), ('Controlador de deshielo electrónico', 66000), ('Controlador de temperatura PID',
                      59500), ('Controlador de compresores en paralelo', 285000), ('Controlador para túnel de congelado', 169000), ('Pantalla remota para controlador', 28900),
                      ('Módulo de comunicación Modbus', 74000), ('Registrador de temperatura USB', 31500), ('Sistema de monitoreo remoto GSM', 196000)):
        add('Control', 'un', 'CTL', mod, base)
    for largo in (1, 2, 3, 5):
        for tipo, base in (('NTC 10 kΩ', 4700), ('PT100', 9800), ('PT1000', 10500), ('termocupla K', 8400)):
            add('Control', 'un', 'SEN', f'Sonda de temperatura {tipo} cable {largo} m', base + largo * 700)
    for rango, base in (('alta -1 a 30 bar', 33000), ('baja -0,5 a 7 bar', 31000), ('dual alta/baja', 38900), ('diferencial de aceite', 47000), ('alta 10 a 45 bar', 35500), ('de ventilador 6 a 28 bar', 29400)):
        add('Control', 'un', 'PRE', f'Presostato {rango}', base)
    for bar in (10, 16, 25, 40, 60, 100):
        add('Control', 'un', 'TRA', f'Transductor de presión 0–{bar} bar 4–20 mA', 28900 + bar * 360)
    for kw in (0.37, 0.75, 1.5, 2.2, 3, 4, 5.5, 7.5, 11, 15):
        for fase, f in (('monofásico', 1.0), ('trifásico', 1.12)):
            add('Control', 'un', 'VFD', f'Variador de frecuencia {kw} kW {fase}'.replace('.', ','), (88000 + kw * 38000) * f)
    for nom, base in (('Temporizador de retardo 0–10 min', 13900), ('Relé de falta de fase', 21800), ('Relé de estado sólido 25 A', 12800), ('Higrostato ambiental', 36500), ('Alarma de gas refrigerante', 187000),
                      ('Detector de CO₂ ambiental', 142000), ('Termómetro digital de ambiente', 7800), ('Sirena estroboscópica 24 V', 17500)):
        add('Control', 'un', 'CTA', nom, base)

    for diam, largos in ((6, (30, 50, 80, 100)), (8, (30, 50, 80, 100, 120)), (10, (40, 60, 80, 100, 120)), (12, (50, 80, 100, 120, 150)), (16, (60, 80, 100, 150))):
        for acab, f in (('galvanizado', 1.0), ('acero inoxidable', 3.2)):
            for largo in largos:
                add('Fijaciones', 'un', 'PER', f'Perno hexagonal M{diam} x {largo} mm {acab}', (diam * largo * 0.32 + 90) * f)
    for diam in (6, 8, 10, 12, 16):
        for acab, f in (('galvanizada', 1.0), ('acero inoxidable', 3.2)):
            add('Fijaciones', 'un', 'TUE', f'Tuerca hexagonal M{diam} {acab}', (diam * 9) * f)
            add('Fijaciones', 'un', 'GOL', f'Golilla plana M{diam} {acab}', (diam * 5) * f)
    for med in ('4,2 x 19', '4,8 x 25', '5,5 x 32', '6,3 x 38', '6,3 x 50', '6,3 x 75'):
        add('Fijaciones', 'un', 'TAP', f'Tornillo autoperforante {med} mm x 100', 3200 + len(med) * 230)
    for med in ('3,2 x 8', '3,2 x 10', '4 x 10', '4,8 x 12', '4,8 x 16', '6,4 x 16'):
        add('Fijaciones', 'un', 'REM', f'Remache pop {med} mm x 100', 1900 + len(med) * 150)
    for diam in range(6, 18, 2):
        for largo in (40, 60, 80):
            add('Fijaciones', 'un', 'TAR', f'Anclaje expansivo {diam} x {largo} mm', 180 + diam * largo / 8)
    for d, f in zip(DIAM, F_DIAM):
        add('Fijaciones', 'un', 'ABR', f'Abrazadera isofónica para tubo {d}', 520 * f ** 0.6)
        add('Fijaciones', 'un', 'COL', f'Soporte colgador para cañería {d}', 890 * f ** 0.6)
    for nom, base in (('Perfil Unistrut 41 x 41 mm 3 m', 14500), ('Barra roscada M8 1 m', 1700), ('Barra roscada M10 1 m', 2400), ('Ángulo de fijación 40 x 40', 1600), ('Soporte para condensador', 22500), ('Base antivibratoria de goma', 3800)):
        add('Fijaciones', 'un', 'FIJ', nom, base)

    for aceite, base in (('POE ISO 32', 9800), ('POE ISO 68', 10400), ('POE ISO 100', 11200), ('PAG ISO 46', 12900), ('PAG ISO 100', 13800), ('mineral ISO 32', 6900), ('mineral ISO 68', 7300), ('alquilbenceno ISO 68', 8800)):
        for fmt, lit, f in (('envase 1 L', 1, 1.0), ('envase 4 L', 4, 3.5), ('bidón 20 L', 20, 15.5)):
            add('Lubricantes', 'lt', 'LUB', f'Aceite {aceite} {fmt}', base * f)
    for nom, base in (('Grasa para rodamientos 400 g', 5800), ('Aerosol lubricante multiuso 400 ml', 4200), ('Aceite para bomba de vacío 1 L', 11500), ('Detector de fugas fluorescente 30 ml', 24500)):
        add('Lubricantes', 'un', 'LUA', nom, base)

    for nom, base in (('Manómetro de baja 0–10 bar', 14900), ('Manómetro de alta 0–35 bar', 15800), ('Manómetro de glicerina 0–60 bar', 19500), ('Manómetro digital 0–60 bar', 87500)):
        add('Herramientas y EPP', 'un', 'MAN', nom, base)
    for tipo, base in (('de 2 vías', 62000), ('de 4 vías R404A', 118000), ('de 4 vías R410A', 126000), ('digital de 4 vías', 245000)):
        add('Herramientas y EPP', 'un', 'MNF', f'Manifold {tipo}', base)
    for largo in (1.5, 3, 5, 10):
        for col, f in (('roja', 1.0), ('azul', 1.0), ('amarilla', 1.0)):
            add('Herramientas y EPP', 'un', 'MGR', f'Manguera de carga {col} {largo} m'.replace('.', ','), 6800 + largo * 2400)
    for nom, base in (('Bomba de vacío 5 CFM', 178000), ('Bomba de vacío 8 CFM', 245000), ('Vacuómetro digital', 67000), ('Balanza electrónica de carga 100 kg', 124000), ('Recuperadora de refrigerante', 485000),
                      ('Cilindro de recuperación 25 kg', 94500), ('Detector electrónico de fugas', 112000), ('Termómetro infrarrojo', 38500), ('Pinza amperimétrica', 52000), ('Multímetro digital', 36800),
                      ('Cortatubos de cobre 1/8"–1 1/8"', 18900), ('Escariador de tubos', 7800), ('Abocardador kit', 44500), ('Expansor de tubos kit', 38900), ('Dobladora de tubos kit', 41000),
                      ('Llave para válvulas de refrigeración', 6800), ('Juego de llaves combinadas 12 pzas', 34800), ('Taladro percutor 800 W', 59000), ('Esmeril angular 4 1/2"', 41500), ('Sierra caladora', 48000)):
        add('Herramientas y EPP', 'un', 'HER', nom, base)
    for tipo, base in (('de corte metal 4 1/2"', 1100), ('de desbaste 4 1/2"', 1300), ('de corte metal 7"', 2500)):
        add('Herramientas y EPP', 'un', 'DIS', f'Disco {tipo}', base)
    for d in (3, 4, 5, 6, 8, 10, 12):
        add('Herramientas y EPP', 'un', 'BRO', f'Broca para metal {d} mm', 800 + d * 190)
        add('Herramientas y EPP', 'un', 'BRH', f'Broca para hormigón {d} mm', 1400 + d * 260)
    for nom, base in (('Guantes de cuero para soldar', 8800), ('Guantes antiquemadura para criogenia', 24500), ('Guantes dieléctricos', 38900), ('Lentes de seguridad claros', 2900), ('Careta para soldar fotosensible', 41500),
                      ('Casco de seguridad con barbiquejo', 5400), ('Arnés de seguridad de 4 puntos', 54000), ('Línea de vida con absorbedor', 32500), ('Respirador con filtro para gases', 21800),
                      ('Filtro de repuesto para gases orgánicos', 6800), ('Zapatos de seguridad dieléctricos', 38800), ('Overol ignífugo', 33500), ('Chaqueta térmica para cámaras -30 °C', 78500),
                      ('Pantalón térmico para cámaras -30 °C', 64000), ('Protector auditivo tipo copa', 11800), ('Extintor PQS 6 kg', 24900), ('Señalética de peligro refrigerante', 4500), ('Botiquín industrial', 19800)):
        add('Herramientas y EPP', 'un', 'EPP', nom, base)

    for nom, base in (('Cinta teflón 12 mm', 380), ('Sellador de roscas 50 ml', 3900), ('Limpiador de contactos eléctricos 400 ml', 5400), ('Desengrasante espumante 600 ml', 4900), ('Limpiador de serpentines 5 L', 17800),
                      ('Pastilla antisarro x 10', 9800), ('Pastillas para bandeja condensado x 20', 5900), ('Trapo de limpieza industrial 1 kg', 2700), ('Bolsa de basura industrial x 10', 3100), ('Pegamento PVC 240 cc', 4800),
                      ('Tubería PVC drenaje 25 mm 3 m', 2400), ('Codo PVC drenaje 25 mm', 280), ('Manguera de drenaje 5/8" 10 m', 8800), ('Sifón de drenaje para evaporador', 6200), ('Tubo capilar 0,031" 1 m', 1900),
                      ('Tubo capilar 0,042" 1 m', 2100), ('Tubo capilar 0,054" 1 m', 2300), ('Silicona neutra 280 ml', 3900), ('Etiqueta de identificación de cañería x 50', 4800), ('Cinta de peligro 100 m', 3600)):
        add('Insumos', 'un', 'INS', nom, base)
    return F


def generar(rng, skus_existentes, objetivo_nuevos):
    """Lista de artículos nuevos (sin id) hasta `objetivo_nuevos`: {sku, nombre, categoria, unidad, costo_unitario, stock_minimo, indice_proveedor}."""
    familias = _familias()
    contador, vistos, salida = {}, set(skus_existentes), []
    nombres_vistos = set()
    for cat, un, pre, nombre, costo in familias:
        if nombre in nombres_vistos:
            continue
        nombres_vistos.add(nombre)
        contador[pre] = contador.get(pre, 0) + 1
        sku = f'{pre}-{contador[pre]:03d}'
        while sku in vistos:
            contador[pre] += 1
            sku = f'{pre}-{contador[pre]:03d}'
        vistos.add(sku)
        c = _redondeo(costo * rng.uniform(0.95, 1.06))
        minimo = rng.randint(40, 120) if c < 2000 else rng.randint(10, 40) if c < 20000 else rng.randint(3, 10) if c < 150000 else rng.randint(1, 3)
        prov = rng.choice(PROVEEDOR_POR_CATEGORIA[cat])
        salida.append({'sku': sku, 'nombre': nombre, 'categoria': cat, 'unidad': un, 'costo_unitario': c, 'stock_minimo': minimo, 'indice_proveedor': prov})
    # Si sobran, se reparte el recorte entre todas las familias (no se pierde una categoría entera); si faltan, se avisa en el comando.
    if len(salida) > objetivo_nuevos:
        rng.shuffle(salida)
        salida = salida[:objetivo_nuevos]
        salida.sort(key=lambda a: (a['categoria'], a['sku']))
    return salida
