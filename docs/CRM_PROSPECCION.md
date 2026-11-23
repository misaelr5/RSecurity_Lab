# Traslado no destructivo a Reac Leads

1. Abrí Descubrimiento y elegí Previsualizar para Reac Leads.
2. Revisá la adaptación de rubros. Los rubros que no tienen equivalente se exportan como Otro. Security Lab conserva el rubro original.
3. El CSV conserva la exclusión y deja el mensaje vacío cuando corresponde. Solo un borrador revisado entra a la transferencia. Los borradores del piloto siguen pendientes.
4. Descargá el CSV y probalo en una copia del CRM. Revisá el diff y los duplicados antes de hacer cualquier importación a producción.
5. La evidencia, los activos y el historial de Security Lab permanecen en su base. El CSV respeta el contrato de 18 campos del CRM.

Se verificaron los módulos importCSV de la rama main de Reac Leads en una carpeta temporal, sin red durante su ejecución. Aceptó las diez filas reales y detectó diez duplicadas en una segunda importación. El CRM original y sus datos permanecieron intactos.
