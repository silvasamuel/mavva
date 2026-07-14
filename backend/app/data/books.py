"""Canonical catalog of the 66 books — validation source for every bible reference."""

from typing import NamedTuple

from app.models.enums import Testament


class Book(NamedTuple):
    slug: str
    name: str
    testament: Testament
    order: int


_OLD = [
    ("genesis", "Gênesis"),
    ("exodo", "Êxodo"),
    ("levitico", "Levítico"),
    ("numeros", "Números"),
    ("deuteronomio", "Deuteronômio"),
    ("josue", "Josué"),
    ("juizes", "Juízes"),
    ("rute", "Rute"),
    ("1samuel", "1 Samuel"),
    ("2samuel", "2 Samuel"),
    ("1reis", "1 Reis"),
    ("2reis", "2 Reis"),
    ("1cronicas", "1 Crônicas"),
    ("2cronicas", "2 Crônicas"),
    ("esdras", "Esdras"),
    ("neemias", "Neemias"),
    ("ester", "Ester"),
    ("jo", "Jó"),
    ("salmos", "Salmos"),
    ("proverbios", "Provérbios"),
    ("eclesiastes", "Eclesiastes"),
    ("cantares", "Cantares"),
    ("isaias", "Isaías"),
    ("jeremias", "Jeremias"),
    ("lamentacoes", "Lamentações"),
    ("ezequiel", "Ezequiel"),
    ("daniel", "Daniel"),
    ("oseias", "Oseias"),
    ("joel", "Joel"),
    ("amos", "Amós"),
    ("obadias", "Obadias"),
    ("jonas", "Jonas"),
    ("miqueias", "Miqueias"),
    ("naum", "Naum"),
    ("habacuque", "Habacuque"),
    ("sofonias", "Sofonias"),
    ("ageu", "Ageu"),
    ("zacarias", "Zacarias"),
    ("malaquias", "Malaquias"),
]

_NEW = [
    ("mateus", "Mateus"),
    ("marcos", "Marcos"),
    ("lucas", "Lucas"),
    ("joao", "João"),
    ("atos", "Atos"),
    ("romanos", "Romanos"),
    ("1corintios", "1 Coríntios"),
    ("2corintios", "2 Coríntios"),
    ("galatas", "Gálatas"),
    ("efesios", "Efésios"),
    ("filipenses", "Filipenses"),
    ("colossenses", "Colossenses"),
    ("1tessalonicenses", "1 Tessalonicenses"),
    ("2tessalonicenses", "2 Tessalonicenses"),
    ("1timoteo", "1 Timóteo"),
    ("2timoteo", "2 Timóteo"),
    ("tito", "Tito"),
    ("filemom", "Filemom"),
    ("hebreus", "Hebreus"),
    ("tiago", "Tiago"),
    ("1pedro", "1 Pedro"),
    ("2pedro", "2 Pedro"),
    ("1joao", "1 João"),
    ("2joao", "2 João"),
    ("3joao", "3 João"),
    ("judas", "Judas"),
    ("apocalipse", "Apocalipse"),
]

BOOKS: dict[str, Book] = {
    slug: Book(slug, name, Testament.OLD, i + 1) for i, (slug, name) in enumerate(_OLD)
} | {slug: Book(slug, name, Testament.NEW, i + 40) for i, (slug, name) in enumerate(_NEW)}


def format_reference(book_slug: str, chapter: int, verse_start: int, verse_end: int | None) -> str:
    name = BOOKS[book_slug].name
    if verse_end and verse_end != verse_start:
        return f"{name} {chapter}:{verse_start}-{verse_end}"
    return f"{name} {chapter}:{verse_start}"
