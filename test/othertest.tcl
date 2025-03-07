proc elo {} {
    set hell "Hello from othertest.tcl"
    puts $hell
}

namespace eval pn {
    proc Hello {} {
        puts "Inside pn::Hello from othertest.tcl"
        if {[info procs eggg] ne ""} {
            eggg
        } else {
            puts "Procedure eggg not defined"
        }
    }
}

set hell "Hello, World!"
elo

puts $hell