"""El generador de datos de demostración deja una base coherente: stock nunca negativo, SKU únicos, retiros que coinciden con el cardex, etc."""
from io import StringIO

from django.core.management import call_command
from django.test import TestCase

from accounts.models import CustomUser, Role
from erp import dominio as dom
from erp import reglas
from erp.models import Registro
from flota.models import DocumentoVehiculo, Vehiculo
from rrhh.models import Contrato, FichaTrabajador


def filas(tabla):
    return [r.fila() for r in Registro.objects.filter(tabla=tabla)]


class PoblarDemoTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.out = StringIO()
        call_command('poblar_demo', force=True, stdout=cls.out)

    def test_catalogo_de_mil_articulos_con_sku_unico_y_proveedor_valido(self):
        arts = filas('articulos')
        self.assertEqual(len(arts), 1000)
        self.assertEqual(len({a['sku'] for a in arts}), 1000)
        provs = {p['id'] for p in filas('proveedores')}
        self.assertTrue(all(a['proveedor_id'] in provs and a['costo_unitario'] > 0 and a['stock_minimo'] > 0 for a in arts))

    def test_el_stock_nunca_es_negativo_y_hay_alertas_de_stock_bajo(self):
        movs = filas('cardex')
        arts = filas('articulos')
        stock = {a['id']: reglas.stock(movs, a['id']) for a in arts}
        self.assertTrue(all(s >= 0 for s in stock.values()))
        self.assertGreater(sum(1 for a in arts if stock[a['id']] < a['stock_minimo']), 0)

    def test_cada_salida_dice_quien_la_entrego_y_a_que_obra(self):
        salidas = [m for m in filas('cardex') if m['tipo'] == reglas.SALIDA]
        self.assertGreater(len(salidas), 100)
        usuarios = {f'U-{u.pk:03d}' for u in CustomUser.objects.all()}
        obras = {o['id'] for o in filas('obras')}
        self.assertTrue(all(m['usuario_id'] in usuarios and m['obra_id'] in obras and m['signo'] == -1 for m in salidas))

    def test_los_retiros_entregados_coinciden_con_sus_movimientos(self):
        movs = {m['id']: m for m in filas('cardex')}
        entregados = [r for r in filas('retiros') if r['estado'] == 'ENTREGADA']
        self.assertGreater(len(entregados), 50)
        for r in entregados:
            esperado = sorted((i['articulo_id'], i['cantidad']) for i in r['items'])
            real = sorted((movs[k]['articulo_id'], movs[k]['cantidad']) for k in r['movimientos'])
            self.assertEqual(esperado, real, r['id'])
            self.assertTrue(all(movs[k]['referencia'] == f"Retiro {r['id']}" and movs[k]['obra_id'] == r['obra_id'] for k in r['movimientos']))
        self.assertTrue({'PENDIENTE', 'RECHAZADA'} <= {r['estado'] for r in filas('retiros')})

    def test_el_cardex_esta_en_orden_cronologico_y_las_entradas_tienen_factura(self):
        movs = filas('cardex')
        fechas = [m['fecha'] for m in sorted(movs, key=lambda m: m['id'])]
        self.assertEqual(fechas, sorted(fechas))
        facturas = {f['id'] for f in filas('facturas')}
        self.assertTrue(all(m['referencia'] in facturas for m in movs if m['tipo'] == reglas.ENTRADA))

    def test_hay_16_tecnicos_con_cuenta_ficha_y_contrato(self):
        personal = filas('personal')
        self.assertEqual(len(personal), 16)
        tecs = CustomUser.objects.filter(pk__in=[int(p['usuario_id'][2:]) for p in personal])
        self.assertEqual((tecs.count(), tecs.filter(role=Role.TECNICO, is_active=True).count()), (16, 16))
        # (además existen 3 cuentas de personas que se van, del demo de finiquitos de RR. HH., que no son técnicos de terreno)
        self.assertEqual(FichaTrabajador.objects.filter(usuario__in=tecs).count(), 16)
        self.assertEqual(Contrato.objects.filter(empleado__in=tecs).count(), 16)
        self.assertTrue(all(dom.validar_rut(p['rut']) for p in personal))
        self.assertEqual({f.tipo_contrato for f in FichaTrabajador.objects.filter(usuario__in=tecs)}, {'INDEFINIDO', 'PLAZO_FIJO', 'OBRA_FAENA'})

    def test_obras_en_todos_los_estados_con_presupuestos_y_cobros(self):
        obras = filas('obras')
        self.assertEqual({o['estado'] for o in obras}, {'PLANIFICADA', 'EN_CURSO', 'FINALIZADA'})
        pres = {p['id']: p for p in filas('presupuestos')}
        self.assertEqual({p['estado'] for p in pres.values()}, {'BORRADOR', 'ENVIADO', 'APROBADO', 'RECHAZADO'})
        for o in obras:
            if o['presupuesto_id']:
                self.assertEqual(pres[o['presupuesto_id']]['estado'], 'APROBADO')
            else:
                self.assertTrue(o['es_emergencia_sin_presupuesto'] and o['tipo'] in dom.TIPOS_SIN_PRESUPUESTO)
        fin = [o for o in obras if o['estado'] == 'FINALIZADA']
        self.assertEqual({o['cobro']['estado'] for o in fin}, {'COBRADO', 'PENDIENTE'})

    def test_las_obras_finalizadas_cumplen_los_requisitos_de_cierre(self):
        hojas, movs, pres = filas('hojas'), filas('cardex'), {p['id']: p for p in filas('presupuestos')}
        for o in filas('obras'):
            if o['estado'] != 'FINALIZADA':
                continue
            checks, ok = dom.validar_cierre(o, pres.get(o['presupuesto_id']), hojas, movs)
            checks.pop('presupuesto', None) if o['es_emergencia_sin_presupuesto'] else None
            self.assertTrue(all(checks.values()), (o['id'], checks))

    def test_hojas_de_servicio_validas(self):
        hojas = filas('hojas')
        self.assertGreater(len(hojas), 80)
        self.assertEqual({h['estado'] for h in hojas}, {'APROBADA', 'ENVIADA', 'DEVUELTA'})
        self.assertTrue(all(dom.checklist_completo(h['checklist_json']) and 0 < h['km_regreso'] - h['km_salida'] <= dom.KM_MAX_POR_HOJA for h in hojas))

    def test_flota_con_revisiones_vigentes_por_vencer_y_vencidas(self):
        from datetime import timedelta

        from django.utils import timezone
        self.assertEqual(Vehiculo.objects.count(), 18)
        hoy = timezone.localdate()
        rev = {}
        for v in Vehiculo.objects.all():
            d = v.documentos.filter(tipo='REVISION_TECNICA').first()
            rev[v.pk] = None if d is None else ('vencida' if d.fecha_vencimiento < hoy else 'por_vencer' if d.fecha_vencimiento <= hoy + timedelta(days=30) else 'vigente')
        self.assertEqual({'vigente', 'por_vencer', 'vencida', None}, set(rev.values()))
        self.assertGreater(DocumentoVehiculo.objects.count(), 50)

    def test_es_idempotente(self):
        antes = Registro.objects.count()
        out = StringIO()
        call_command('poblar_demo', force=True, stdout=out)
        self.assertEqual(Registro.objects.count(), antes)
        self.assertIn('ya tiene el catálogo completo', out.getvalue())

    def test_ids_unicos_por_tabla_y_tamano_razonable(self):
        total = Registro.objects.count()
        self.assertLess(total, 6000)  # la base gratis no se llena
        self.assertEqual(total, len({(r.tabla, r.rid) for r in Registro.objects.all()}))
