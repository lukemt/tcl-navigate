source othertest.tcl

namespace eval ::data {
    variable testMsg "Global test message"
}

proc eggg {} {
    puts "Inside global eggg from test.tcl -- ::data::testMsg: $::data::testMsg"
}

puts "Running tests from test.tcl"

puts "Test 1: call global eggg"
eggg

puts "Test 2: call global elo from othertest.tcl"
elo

puts "Test 3: call pn::Hello from othertest.tcl"
pn::Hello

