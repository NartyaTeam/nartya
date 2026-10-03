# Sécurité

## Signaler une faille

N'ouvrez pas d'issue publique. Écrivez à **contact@nartya.app** en décrivant :

- ce que la faille permet ;
- les étapes pour la reproduire ;
- la version de l'application et la plateforme.

Nous accusons réception sous quelques jours et vous tenons au courant de la correction.

## Périmètre

L'application cliente de ce dépôt, et les règles d'accès aux données qu'elle utilise
(schéma SQL de `supabase/`).

La clé « anon » de Supabase embarquée dans l'application est publique par conception : sa
présence dans le code ou dans un build n'est pas une faille. Ce qui compte, c'est ce
qu'elle permet de lire ou d'écrire.
