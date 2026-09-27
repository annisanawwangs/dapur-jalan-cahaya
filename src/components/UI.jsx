import React from 'react'

export function Card({children, className=''}) { return <div className={`card ${className}`}>{children}</div> }
export function Stat({label, value, hint, icon}) { return <Card><div className="stat-icon">{icon}</div><div><div className="muted small">{label}</div><div className="stat-value">{value}</div>{hint && <div className="muted tiny">{hint}</div>}</div></Card> }
export function Empty({title='Belum ada data', text='Tambahkan data pertama untuk mulai.'}) { return <div className="empty"><strong>{title}</strong><span>{text}</span></div> }
export function Modal({open, title, children, onClose}) { if(!open) return null; return <div className="overlay" onMouseDown={onClose}><div className="modal" onMouseDown={e=>e.stopPropagation()}><div className="modal-head"><h3>{title}</h3><button className="icon-btn" onClick={onClose}>×</button></div>{children}</div></div> }
export function Toast({message, type='ok'}) { if(!message) return null; return <div className={`toast ${type}`}>{message}</div> }
